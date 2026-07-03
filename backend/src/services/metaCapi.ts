import crypto from 'crypto';

interface MetaCapiPayload {
  pixelId: string;
  token: string;
  eventName: string;
  phone: string;
  utms: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
  };
  // Atribuição fina — rotador (tráfego→URL) ou CTWA (anúncio msg direta)
  fbclid?: string | null;
  ctwaClid?: string | null;
  // Exigidos p/ business_messaging (CTWA): um dos dois.
  pageId?: string | null;
  wabaId?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  clickTimeMs?: number | null;
  eventId?: string | null;
  // Valor da conversão (otimização por receita/ROAS no Meta)
  value?: number | null;
  currency?: string | null;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export interface MetaCapiResult {
  ok: boolean;
  status: number;
  sentEvent: string;      // nome do evento realmente enviado (após remap)
  actionSource: string;
  response: string;       // fbtrace_id (sucesso) ou corpo do erro
}

export async function fireMetaCapi(payload: MetaCapiPayload): Promise<MetaCapiResult> {
  const { pixelId, token, eventName, phone, utms, fbclid, ctwaClid, pageId, wabaId, clientIp, userAgent, clickTimeMs, eventId, value, currency } = payload;

  const normalizedPhone = phone.replace(/\D/g, '');

  // fbc = fb.1.<click_timestamp_ms>.<fbclid> — fluxo rotador (URL com fbclid)
  const fbc = fbclid ? `fb.1.${clickTimeMs || Date.now()}.${fbclid}` : undefined;

  const userData: Record<string, unknown> = { ph: [sha256(normalizedPhone)] };
  if (fbc) userData.fbc = fbc;
  // ctwa_clid — atribuição de anúncio de mensagem direta (Click to WhatsApp)
  if (ctwaClid) userData.ctwa_clid = ctwaClid;
  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;

  // fbc = clique em URL (rotador) → 'website'
  // ctwa_clid = anúncio msg direta → normalmente 'business_messaging', MAS a Meta
  // recusa com subcode 2804131 ("dataset sem Página associada") nesse dataset e não
  // há tela/endpoint que resolva o vínculo (ver checkpoint 2026-07-03). Até liberar
  // do lado Meta, manda como 'system_generated' — ctwa_clid segue no user_data pra
  // atribuição, só não declara a fonte que a Meta bloqueia.
  // orgânico → 'system_generated'
  const actionSource: string = fbc ? 'website' : 'system_generated';

  // page_id/whatsapp_business_account_id vão DENTRO de user_data (não no nível do
  // evento) — subcode 2804116 diz explicitamente "nos dados do usuário".
  if (actionSource === 'business_messaging') {
    if (pageId) userData.page_id = pageId;
    if (wabaId) userData.whatsapp_business_account_id = wabaId;
  }

  // Meta só aceita uma lista fechada de eventos p/ business_messaging (CTWA).
  // 'Lead' é INVÁLIDO nesse contexto (erro 2804066) — mapeia pro equivalente de
  // mensagens. 'Purchase' já é válido, então mantém. Website/system seguem crus.
  const CTWA_EVENT_MAP: Record<string, string> = { Lead: 'LeadSubmitted' };
  const effectiveEventName =
    actionSource === 'business_messaging' ? CTWA_EVENT_MAP[eventName] || eventName : eventName;

  // Purchase EXIGE value+currency no Meta; se o gatilho não tem valor, manda 0/BRL
  // pra não estourar "Purchase requires currency and value". Demais eventos só
  // enviam value quando há valor configurado.
  const effectiveValue = value != null ? value : eventName === 'Purchase' ? 0 : null;
  const customData: Record<string, unknown> = {
    utm_source: utms.source,
    utm_medium: utms.medium,
    utm_campaign: utms.campaign,
  };
  if (effectiveValue != null) {
    customData.value = effectiveValue;
    customData.currency = currency || 'BRL';
  }

  const body = {
    data: [
      {
        event_name: effectiveEventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: actionSource,
        // Meta exige messaging_channel quando action_source = business_messaging
        // (CTWA/WhatsApp). page_id/waba já foram pro user_data acima (subcode 2804116).
        ...(actionSource === 'business_messaging' ? { messaging_channel: 'whatsapp' } : {}),
        ...(eventId ? { event_id: eventId } : {}),
        user_data: userData,
        custom_data: customData,
      },
    ],
  };

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const responseText = (await res.text()).slice(0, 500);
  if (!res.ok) {
    console.warn(`[CAPI] ${effectiveEventName} FALHOU status=${res.status}: ${responseText}`);
  }
  return {
    ok: res.ok,
    status: res.status,
    sentEvent: effectiveEventName,
    actionSource,
    response: responseText,
  };
}

/** Dispara ViewContent sem phone — usado na landing page do rotador. */
export async function firePageViewCapi(opts: {
  pixelId: string;
  token: string;
  fbclid?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  eventId?: string;
}): Promise<void> {
  const { pixelId, token, fbclid, clientIp, userAgent, eventId } = opts;
  const fbc = fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined;
  const userData: Record<string, unknown> = {};
  if (fbc) userData.fbc = fbc;
  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;

  const body = {
    data: [{
      event_name: 'ViewContent',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      ...(eventId ? { event_id: eventId } : {}),
      user_data: userData,
    }],
  };

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) console.warn('[CAPI PageView]', await res.text());
}

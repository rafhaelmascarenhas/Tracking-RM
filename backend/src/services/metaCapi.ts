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

export async function fireMetaCapi(payload: MetaCapiPayload): Promise<void> {
  const { pixelId, token, eventName, phone, utms, fbclid, ctwaClid, clientIp, userAgent, clickTimeMs, eventId, value, currency } = payload;

  const normalizedPhone = phone.replace(/\D/g, '');

  // fbc = fb.1.<click_timestamp_ms>.<fbclid> — fluxo rotador (URL com fbclid)
  const fbc = fbclid ? `fb.1.${clickTimeMs || Date.now()}.${fbclid}` : undefined;

  const userData: Record<string, unknown> = { ph: [sha256(normalizedPhone)] };
  if (fbc) userData.fbc = fbc;
  // ctwa_clid — atribuição de anúncio de mensagem direta (Click to WhatsApp)
  if (ctwaClid) userData.ctwa_clid = ctwaClid;
  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;

  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        // fbc = clique em URL (rotador) → 'website'
        // ctwa_clid = anúncio msg direta → 'business_messaging'
        // orgânico → 'system_generated'
        action_source: fbc ? 'website' : ctwaClid ? 'business_messaging' : 'system_generated',
        ...(eventId ? { event_id: eventId } : {}),
        user_data: userData,
        custom_data: {
          utm_source: utms.source,
          utm_medium: utms.medium,
          utm_campaign: utms.campaign,
          // value + currency = otimização por receita; só envia se houver valor
          ...(value != null ? { value, currency: currency || 'BRL' } : {}),
        },
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Meta CAPI error: ${err}`);
  }
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

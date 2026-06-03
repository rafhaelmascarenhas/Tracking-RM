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
  // Atribuição fina (Fase 2 — rotador). Sem ctwa_clid no caminho Tráfego→URL.
  fbclid?: string | null;
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
  const { pixelId, token, eventName, phone, utms, fbclid, clientIp, userAgent, clickTimeMs, eventId, value, currency } = payload;

  const normalizedPhone = phone.replace(/\D/g, '');

  // fbc = fb.1.<click_timestamp_ms>.<fbclid> (substitui ctwa_clid neste fluxo)
  const fbc = fbclid ? `fb.1.${clickTimeMs || Date.now()}.${fbclid}` : undefined;

  const userData: Record<string, unknown> = { ph: [sha256(normalizedPhone)] };
  if (fbc) userData.fbc = fbc;
  if (clientIp) userData.client_ip_address = clientIp;
  if (userAgent) userData.client_user_agent = userAgent;

  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        // 'website' quando temos fbc (origem foi clique em URL); senão mantém system_generated
        action_source: fbc ? 'website' : 'system_generated',
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

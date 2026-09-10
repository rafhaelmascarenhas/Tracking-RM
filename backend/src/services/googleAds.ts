import crypto from 'crypto';

/**
 * Upload de conversão offline pro Google Ads (equivalente ao metaCapi).
 *
 * Fluxo: clique no anúncio traz gclid (ou wbraid/gbraid em iOS/app) na URL do
 * rotador -> gravado no RotatorClick -> casado com o lead pelo token da mensagem
 * -> quando o lead converte (etapa/gatilho), mandamos a conversão de volta pro
 * Google com aquele identificador. É o "Import de conversões offline".
 *
 * Diferenças relevantes vs Meta:
 *  - Não existe pixel/token por workspace. Credenciais são OAuth de app + developer
 *    token, iguais pra todas as contas -> ficam em env, não no banco.
 *  - Cada evento precisa apontar pra uma Conversion Action já criada no painel.
 *    O mapa evento->ID vive em Workspace.google_conversion_actions (JSON).
 *  - gclid, wbraid e gbraid são MUTUAMENTE EXCLUSIVOS no payload.
 */

// v23 confirmado vivo em set/2026 (v18 e anteriores foram desativadas -> 404).
// Alinhado com o painel adagency, que usa a mesma versao no mesmo host.
const API_VERSION = 'v23';
const OAUTH_URL = 'https://oauth2.googleapis.com/token';

// Google recusa clique mais velho que isso (equivalente aos 7 dias da Meta).
const MAX_CLICK_AGE_DAYS = 90;

export interface GoogleAdsPayload {
  customerId: string;              // ID da conta Ads, só dígitos (ex: 7259523207)
  conversionActionId: string;      // ID numérico da Conversion Action
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  clickTimeMs?: number | null;     // horário do clique — valida a janela de 90d
  eventTimeMs?: number | null;     // horário da conversão. Default: agora
  value?: number | null;
  currency?: string | null;
  orderId?: string | null;         // dedupe: reenvio com mesmo orderId não duplica
}

export interface GoogleAdsResult {
  ok: boolean;
  status: number;
  response: string; // resource name (sucesso) ou corpo do erro
}

/**
 * "yyyy-MM-dd HH:mm:ss+HH:mm" no fuso da conta Ads. O Google recusa ISO-8601 puro
 * e recusa data sem offset. GOOGLE_ADS_TIMEZONE_OFFSET default -03:00 (Brasil).
 */
function formatConversionDateTime(ms: number): string {
  const offset = process.env.GOOGLE_ADS_TIMEZONE_OFFSET || '-03:00';
  const sign = offset.startsWith('-') ? -1 : 1;
  const [oh, om] = offset.slice(1).split(':').map(Number);
  const shifted = new Date(ms + sign * (oh * 60 + om) * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())} ` +
    `${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}:${p(shifted.getUTCSeconds())}${offset}`
  );
}

// Access token dura 1h; cacheia em memória pra não bater no OAuth a cada conversão.
let _token: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _token.expiresAt) return _token.value;

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GOOGLE_ADS_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN ausentes no env');
  }

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${body.slice(0, 300)}`);

  const json = JSON.parse(body) as { access_token: string; expires_in: number };
  // 60s de margem pra não usar token que expira no meio da chamada.
  _token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return _token.value;
}

/** Lê o mapa evento->conversionActionId do workspace. Tolera JSON quebrado. */
export function resolveConversionActionId(raw: string | null | undefined, eventName: string): string | null {
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[eventName] || null;
  } catch {
    return null;
  }
}

export async function fireGoogleAdsConversion(payload: GoogleAdsPayload): Promise<GoogleAdsResult> {
  const { customerId, conversionActionId, gclid, wbraid, gbraid, clickTimeMs, eventTimeMs, value, currency, orderId } = payload;

  const cid = customerId.replace(/\D/g, '');
  if (!cid) return { ok: false, status: 0, response: 'customerId vazio' };

  // Sem identificador de clique não há o que atribuir. Enhanced Conversions por
  // e-mail/telefone hasheado é outro endpoint (uploadUserData) e não se aplica aqui.
  if (!gclid && !wbraid && !gbraid) {
    return { ok: false, status: 0, response: 'lead sem gclid/wbraid/gbraid — nada a enviar' };
  }

  if (clickTimeMs) {
    const ageDays = (Date.now() - clickTimeMs) / 86_400_000;
    if (ageDays > MAX_CLICK_AGE_DAYS) {
      return { ok: false, status: 0, response: `clique com ${Math.floor(ageDays)}d — acima do limite de ${MAX_CLICK_AGE_DAYS}d` };
    }
  }

  const conversion: Record<string, unknown> = {
    conversionAction: `customers/${cid}/conversionActions/${conversionActionId}`,
    conversionDateTime: formatConversionDateTime(eventTimeMs || Date.now()),
  };
  // Exclusivos entre si — mandar dois faz o Google recusar o registro inteiro.
  if (gclid) conversion.gclid = gclid;
  else if (wbraid) conversion.wbraid = wbraid;
  else if (gbraid) conversion.gbraid = gbraid;

  if (value != null) {
    conversion.conversionValue = value;
    conversion.currencyCode = currency || 'BRL';
  }
  if (orderId) conversion.orderId = orderId.slice(0, 64);

  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) return { ok: false, status: 0, response: 'GOOGLE_ADS_DEVELOPER_TOKEN ausente no env' };

  const accessToken = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  // Conta filha sob MCC exige o ID do gerenciador no header, senão dá PERMISSION_DENIED.
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/\D/g, '');
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;

  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${cid}:uploadClickConversions`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    // partialFailure: um registro ruim não derruba o lote (aqui é 1, mas mantém
    // o erro legível no corpo em vez de 400 seco).
    body: JSON.stringify({ conversions: [conversion], partialFailure: true, validateOnly: process.env.GOOGLE_ADS_VALIDATE_ONLY === 'true' }),
  });

  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, response: text.slice(0, 500) };

  const json = JSON.parse(text) as {
    partialFailureError?: { message?: string };
    results?: Array<{ gclid?: string; conversionAction?: string }>;
  };
  // 200 com partialFailureError = o registro foi RECUSADO. Sem isso, erro de
  // atribuição vira "sucesso" no painel de disparos e ninguém percebe.
  if (json.partialFailureError) {
    return { ok: false, status: res.status, response: String(json.partialFailureError.message || text).slice(0, 500) };
  }

  return { ok: true, status: res.status, response: json.results?.[0]?.conversionAction || 'ok' };
}

/** Hash usado se algum dia ligarmos Enhanced Conversions for Leads (telefone/e-mail). */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

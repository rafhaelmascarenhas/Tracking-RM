import crypto from 'crypto';

/**
 * Upload de conversão offline pro Google Ads (equivalente ao metaCapi).
 *
 * Fluxo: clique no anúncio traz gclid (ou wbraid/gbraid em iOS/app) na URL do
 * rotador -> gravado no RotatorClick -> casado com o lead pelo token da mensagem
 * -> quando o lead converte (etapa/gatilho), mandamos a conversão de volta pro
 * Google com aquele identificador.
 *
 * Desde set/2026 o upload usa a DATA MANAGER API (events:ingest), não mais o
 * ConversionUploadService do Google Ads API: integrações novas são bloqueadas lá
 * ("Usage of ConversionUploadService.UploadClickConversions is limited to
 * existing users"). Diferenças herdadas da migração:
 *  - NÃO precisa de developer token.
 *  - Escopo OAuth é https://www.googleapis.com/auth/datamanager (não adwords) —
 *    o refresh token tem que ter sido emitido com ele.
 *  - operatingAccount = conta DONA da conversion action (a filha, não a MCC);
 *    a MCC vai em loginAccount (equivale ao antigo login-customer-id).
 *  - eventTimestamp é RFC-3339 normal (acabou o formato "yyyy-MM-dd HH:mm:ss±HH:mm").
 *  - Não existe click_time no payload; a janela de 90d continua valendo do lado
 *    do Google, então mantemos a checagem local pra falhar com mensagem clara.
 *
 * Igual antes:
 *  - Credenciais em env, iguais pra todas as contas. Só google_ads_id e o mapa
 *    evento->conversionActionId (Workspace.google_conversion_actions) são por workspace.
 *  - gclid, wbraid e gbraid são MUTUAMENTE EXCLUSIVOS.
 */

const INGEST_URL = 'https://datamanager.googleapis.com/v1/events:ingest';
const OAUTH_URL = 'https://oauth2.googleapis.com/token';

// Google recusa clique mais velho que isso (equivalente aos 7 dias da Meta).
const MAX_CLICK_AGE_DAYS = 90;

export interface GoogleAdsPayload {
  customerId: string;              // ID da conta Ads dona da conversion action, só dígitos
  conversionActionId: string;      // ID numérico da Conversion Action (productDestinationId)
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  clickTimeMs?: number | null;     // horário do clique — valida a janela de 90d
  eventTimeMs?: number | null;     // horário da conversão. Default: agora
  value?: number | null;
  currency?: string | null;
  orderId?: string | null;         // dedupe: vira transactionId
}

export interface GoogleAdsResult {
  ok: boolean;
  status: number;
  response: string; // requestId (sucesso) ou corpo do erro
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
  // e-mail/telefone hasheado é userData/userProperties e não se aplica aqui.
  if (!gclid && !wbraid && !gbraid) {
    return { ok: false, status: 0, response: 'lead sem gclid/wbraid/gbraid — nada a enviar' };
  }

  if (clickTimeMs) {
    const ageDays = (Date.now() - clickTimeMs) / 86_400_000;
    if (ageDays > MAX_CLICK_AGE_DAYS) {
      return { ok: false, status: 0, response: `clique com ${Math.floor(ageDays)}d — acima do limite de ${MAX_CLICK_AGE_DAYS}d` };
    }
  }

  // Exclusivos entre si — mandar dois faz o Google recusar o registro inteiro.
  const adIdentifiers: Record<string, string> = {};
  if (gclid) adIdentifiers.gclid = gclid;
  else if (wbraid) adIdentifiers.wbraid = wbraid;
  else if (gbraid) adIdentifiers.gbraid = gbraid;

  const event: Record<string, unknown> = {
    adIdentifiers,
    eventTimestamp: new Date(eventTimeMs || Date.now()).toISOString(),
    eventSource: 'WEB',
  };
  if (value != null) {
    event.conversionValue = value;
    event.currency = currency || 'BRL';
  }
  if (orderId) event.transactionId = orderId.slice(0, 64);

  const destination: Record<string, unknown> = {
    // Tem que ser a conta DONA da conversion action; MCC aqui dá erro de destino.
    operatingAccount: { accountType: 'GOOGLE_ADS', accountId: cid },
    productDestinationId: conversionActionId,
  };
  // Acesso via MCC: o antigo login-customer-id virou loginAccount.
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/\D/g, '');
  if (loginCustomerId && loginCustomerId !== cid) {
    destination.loginAccount = { accountType: 'GOOGLE_ADS', accountId: loginCustomerId };
  }

  const accessToken = await getAccessToken();

  const res = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      destinations: [destination],
      events: [event],
      validateOnly: process.env.GOOGLE_ADS_VALIDATE_ONLY === 'true',
    }),
  });

  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, response: text.slice(0, 500) };

  const json = JSON.parse(text) as { requestId?: string };
  return { ok: true, status: res.status, response: json.requestId || 'ok' };
}

/** Hash usado se algum dia ligarmos Enhanced Conversions for Leads (telefone/e-mail). */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

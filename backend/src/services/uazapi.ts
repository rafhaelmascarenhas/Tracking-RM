import { prisma } from '../lib/prisma';

/**
 * Cliente uazapi (v2 — docs.uazapi.com).
 *
 * Autenticação:
 *  - operações de admin (criar/deletar instância): header `admintoken`
 *  - operações da instância (connect/status/webhook/logout): header `token`
 *
 * Config por workspace (setada 1x em Settings): `uazapi_url` + `uazapi_admin_token`.
 * O token de cada instância fica em WhatsappConnection.uazapi_token.
 */

export type UazapiConfig = { url: string; adminToken: string };

export class UazapiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Lê e valida a config uazapi do workspace. */
export async function getWorkspaceUazapi(workspaceId: string): Promise<UazapiConfig> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { uazapi_url: true, uazapi_admin_token: true },
  });
  if (!ws?.uazapi_url || !ws?.uazapi_admin_token) {
    throw new UazapiError('uazapi não configurada. Defina URL e admin token em Configurações.', 400);
  }
  return { url: ws.uazapi_url.replace(/\/+$/, ''), adminToken: ws.uazapi_admin_token };
}

async function call(
  cfg: UazapiConfig,
  method: string,
  path: string,
  opts: { token?: string; admin?: boolean; body?: any } = {}
): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.admin) headers.admintoken = cfg.adminToken;
  if (opts.token) headers.token = opts.token;

  let res: Response;
  try {
    res = await fetch(`${cfg.url}${path}`, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e: any) {
    throw new UazapiError(`Falha de rede ao falar com uazapi: ${e.message}`);
  }

  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = { raw };
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || raw || res.statusText;
    throw new UazapiError(`uazapi ${method} ${path} → ${res.status}: ${msg}`, 502);
  }
  return data;
}

// ---- Normalizadores (toleram pequenas variações de shape entre versões) ----

/** Acha o objeto instance dentro da resposta. */
function pickInstance(data: any): any {
  return data?.instance ?? data ?? {};
}

/** Normaliza o status pra CONNECTED | CONNECTING | DISCONNECTED. */
export function normalizeStatus(data: any): 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' {
  const inst = pickInstance(data);
  const loggedIn = data?.loggedIn ?? inst?.loggedIn;
  const connected = data?.connected ?? inst?.connected;
  if (loggedIn === true || connected === true) return 'CONNECTED';
  const s = String(inst?.status ?? data?.status ?? '').toLowerCase();
  if (s === 'connected') return 'CONNECTED';
  if (s === 'connecting' || s === 'qrcode' || s === 'pairing') return 'CONNECTING';
  return 'DISCONNECTED';
}

/** Extrai o QR code (data URL base64) se existir. */
export function pickQrcode(data: any): string | null {
  const inst = pickInstance(data);
  const qr = inst?.qrcode ?? data?.qrcode ?? inst?.qrCode ?? data?.qrCode ?? null;
  if (!qr) return null;
  return String(qr).startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
}

/** Extrai o telefone (só dígitos) do dono da instância. */
export function pickPhone(data: any): string | null {
  const inst = pickInstance(data);
  const owner = inst?.owner ?? inst?.wid ?? inst?.jid ?? data?.owner ?? '';
  const digits = String(owner).replace(/\D/g, '');
  return digits || null;
}

export function pickProfileName(data: any): string | null {
  const inst = pickInstance(data);
  return inst?.profileName ?? inst?.name ?? data?.profileName ?? null;
}

// ---- Operações ----

/** Cria a instância na uazapi. Retorna o token da instância. */
export async function initInstance(cfg: UazapiConfig, name: string): Promise<string> {
  const data = await call(cfg, 'POST', '/instance/init', { admin: true, body: { name } });
  const inst = pickInstance(data);
  const token = inst?.token ?? data?.token;
  if (!token) throw new UazapiError('uazapi não retornou token da instância no init.');
  return String(token);
}

/** Configura o webhook da instância (eventos de mensagens + conexão). */
export async function setWebhook(cfg: UazapiConfig, token: string, url: string): Promise<void> {
  // uazapiGO usa POST /webhook (não /instance/updateWebhook).
  await call(cfg, 'POST', '/webhook', {
    token,
    body: {
      enabled: true,
      url,
      events: ['messages', 'messages_update', 'connection'],
      excludeMessages: ['wasSentByApi'],
    },
  });
}

/** Inicia conexão (gera QR). Retorna resposta crua já normalizada. */
export async function connectInstance(cfg: UazapiConfig, token: string) {
  const data = await call(cfg, 'POST', '/instance/connect', { token, body: {} });
  return {
    status: normalizeStatus(data),
    qrcode: pickQrcode(data),
    phone: pickPhone(data),
    profileName: pickProfileName(data),
  };
}

/** Consulta status atual (inclui QR enquanto conectando). */
export async function getStatus(cfg: UazapiConfig, token: string) {
  const data = await call(cfg, 'GET', '/instance/status', { token });
  return {
    status: normalizeStatus(data),
    qrcode: pickQrcode(data),
    phone: pickPhone(data),
    profileName: pickProfileName(data),
  };
}

/** Desconecta (logout) a instância sem deletá-la. */
export async function disconnectInstance(cfg: UazapiConfig, token: string): Promise<void> {
  await call(cfg, 'POST', '/instance/disconnect', { token });
}

/** Deleta a instância na uazapi (best-effort). */
export async function deleteInstance(cfg: UazapiConfig, token: string): Promise<void> {
  await call(cfg, 'DELETE', '/instance', { token });
}

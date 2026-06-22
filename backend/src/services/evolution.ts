import { prisma } from '../lib/prisma';

/**
 * Cliente Evolution API v2 (doc.evolution-api.com).
 *
 * Autenticação: header `apikey` com a AUTHENTICATION_API_KEY global do servidor.
 * A mesma key serve a todas as operações (admin e por instância) — diferente da
 * uazapi, o Evolution NÃO usa token por instância para operar.
 *
 * As operações são chaveadas pelo NOME da instância (não por token). O nome é
 * salvo em WhatsappConnection.session_name e casa com `body.instance` do webhook.
 *
 * Config por workspace (Settings): `evolution_url` + `evolution_api_key`.
 */

export type EvolutionConfig = { url: string; apiKey: string };

export class EvolutionError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Lê e valida a config Evolution do workspace. */
export async function getWorkspaceEvolution(workspaceId: string): Promise<EvolutionConfig> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { evolution_url: true, evolution_api_key: true },
  });
  if (!ws?.evolution_url || !ws?.evolution_api_key) {
    throw new EvolutionError('Evolution não configurada. Defina URL e API key em Configurações.', 400);
  }
  return { url: ws.evolution_url.replace(/\/+$/, ''), apiKey: ws.evolution_api_key };
}

async function call(
  cfg: EvolutionConfig,
  method: string,
  path: string,
  opts: { body?: any } = {}
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: cfg.apiKey,
  };

  let res: Response;
  try {
    res = await fetch(`${cfg.url}${path}`, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e: any) {
    throw new EvolutionError(`Falha de rede ao falar com Evolution: ${e.message}`);
  }

  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = { raw };
  }
  if (!res.ok) {
    const msg = data?.response?.message || data?.error || data?.message || raw || res.statusText;
    throw new EvolutionError(`Evolution ${method} ${path} → ${res.status}: ${Array.isArray(msg) ? msg.join('; ') : msg}`, 502);
  }
  return data;
}

// ---- Normalizadores ----

/** open → CONNECTED | connecting/qrcode → CONNECTING | resto → DISCONNECTED. */
export function normalizeState(state: unknown): 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' {
  const s = String(state ?? '').toLowerCase();
  if (s === 'open' || s === 'connected') return 'CONNECTED';
  if (s === 'connecting' || s === 'qrcode' || s === 'pairing') return 'CONNECTING';
  return 'DISCONNECTED';
}

/** Extrai o QR (data URL base64). Evolution põe em qrcode.base64 ou base64 no topo. */
export function pickQrcode(data: any): string | null {
  const qr = data?.qrcode?.base64 ?? data?.base64 ?? data?.qrcode?.code ?? null;
  if (!qr) return null;
  return String(qr).startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
}

/** Telefone (só dígitos) a partir do ownerJid. */
export function pickPhone(inst: any): string | null {
  const owner = inst?.ownerJid ?? inst?.owner ?? '';
  const digits = String(owner).replace(/@.*$/, '').replace(/\D/g, '');
  return digits || null;
}

export function pickProfileName(inst: any): string | null {
  return inst?.profileName ?? inst?.name ?? null;
}

/** Busca os detalhes (ownerJid/profileName/connectionStatus) de uma instância pelo nome. */
async function fetchInstance(cfg: EvolutionConfig, name: string): Promise<any | null> {
  const data = await call(cfg, 'GET', `/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`);
  const arr = Array.isArray(data) ? data : data ? [data] : [];
  return arr[0] ?? null;
}

// ---- Operações ----

/**
 * Cria a instância no Evolution. Não retorna token (usa apikey global).
 * `qrcode:true` já dispara a geração do QR no create.
 */
export async function createInstance(cfg: EvolutionConfig, name: string): Promise<void> {
  await call(cfg, 'POST', '/instance/create', {
    body: { instanceName: name, integration: 'WHATSAPP-BAILEYS', qrcode: true },
  });
}

/** Configura o webhook da instância (mensagens + conexão). */
export async function setWebhook(cfg: EvolutionConfig, name: string, url: string): Promise<void> {
  await call(cfg, 'POST', `/webhook/set/${encodeURIComponent(name)}`, {
    body: {
      webhook: {
        enabled: true,
        url,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    },
  });
}

/** Inicia conexão (gera/renova QR). */
export async function connectInstance(cfg: EvolutionConfig, name: string) {
  const data = await call(cfg, 'GET', `/instance/connect/${encodeURIComponent(name)}`);
  const inst = await fetchInstance(cfg, name).catch(() => null);
  return {
    status: normalizeState(inst?.connectionStatus ?? (data?.instance?.state)),
    qrcode: pickQrcode(data),
    phone: inst ? pickPhone(inst) : null,
    profileName: inst ? pickProfileName(inst) : null,
  };
}

/** Consulta status. Se ainda não conectado, devolve QR fresco pra polling. */
export async function getStatus(cfg: EvolutionConfig, name: string) {
  const state = await call(cfg, 'GET', `/instance/connectionState/${encodeURIComponent(name)}`);
  const status = normalizeState(state?.instance?.state ?? state?.state);
  if (status === 'CONNECTED') {
    const inst = await fetchInstance(cfg, name).catch(() => null);
    return { status, qrcode: null, phone: inst ? pickPhone(inst) : null, profileName: inst ? pickProfileName(inst) : null };
  }
  // Conectando/desconectado: busca QR fresco pra UI continuar o polling.
  const conn = await call(cfg, 'GET', `/instance/connect/${encodeURIComponent(name)}`).catch(() => null);
  return { status, qrcode: conn ? pickQrcode(conn) : null, phone: null, profileName: null };
}

/** Desconecta (logout) sem deletar a instância. */
export async function disconnectInstance(cfg: EvolutionConfig, name: string): Promise<void> {
  await call(cfg, 'DELETE', `/instance/logout/${encodeURIComponent(name)}`);
}

/** Deleta a instância no Evolution (best-effort). */
export async function deleteInstance(cfg: EvolutionConfig, name: string): Promise<void> {
  await call(cfg, 'DELETE', `/instance/delete/${encodeURIComponent(name)}`);
}

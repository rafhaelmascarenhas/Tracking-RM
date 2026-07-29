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

// Sem timeout, uma chamada pendurada segura a requisição HTTP indefinidamente e
// a tela fica girando pra sempre. Acontece de verdade: fetchAllGroups numa conta
// com muitos grupos grandes passa de 2 minutos sem responder.
const DEFAULT_TIMEOUT_MS = 30_000;

async function call(
  cfg: EvolutionConfig,
  method: string,
  path: string,
  opts: { body?: any; timeoutMs?: number } = {}
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
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (e: any) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new EvolutionError(
        `A Evolution não respondeu a tempo (${((opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000).toFixed(0)}s). Tente de novo em instantes.`,
        504
      );
    }
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

/**
 * Configura o webhook da instância (mensagens + conexão + entradas em grupo).
 *
 * GROUP_PARTICIPANTS_UPDATE só chega se o número conectado for ADMIN do grupo.
 * Instâncias criadas antes desse evento existir precisam de re-set (rota
 * POST /numbers/:id/resync-webhook) — o Evolution não adiciona evento sozinho.
 */
export async function setWebhook(cfg: EvolutionConfig, name: string, url: string): Promise<void> {
  const CORE_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'];
  const post = (events: string[]) =>
    call(cfg, 'POST', `/webhook/set/${encodeURIComponent(name)}`, {
      body: {
        webhook: { enabled: true, url, webhookByEvents: false, webhookBase64: false, events },
      },
    });

  try {
    await post([...CORE_EVENTS, 'GROUP_PARTICIPANTS_UPDATE']);
  } catch (e: any) {
    // Versão de Evolution que não conhece o evento rejeita a lista INTEIRA — e o
    // chamador engole o erro num warn. Sem este retry o número ficaria sem webhook
    // nenhum, quebrando o rotador de números por causa de um recurso de grupo.
    console.warn(
      `[evolution] GROUP_PARTICIPANTS_UPDATE recusado em "${name}" (${e.message}). ` +
        'Reassinando só os eventos core — contagem de membros de grupo fica indisponível.'
    );
    await post(CORE_EVENTS);
  }
}

export type EvolutionGroup = {
  jid: string;
  name: string;
  size: number;
  // null = não deu pra determinar (não sabemos o telefone da instância).
  // Distinguir de `false` é essencial: afirmar "não é admin" sem saber faz a
  // tela desabilitar grupos dos quais o número É admin.
  is_admin: boolean | null;
};

/** Telefone (só dígitos) da instância, direto do Evolution. */
export async function fetchInstancePhone(
  cfg: EvolutionConfig,
  name: string
): Promise<string | null> {
  const inst = await fetchInstance(cfg, name).catch(() => null);
  return inst ? pickPhone(inst) : null;
}

/**
 * Lista os grupos em que a instância está, marcando onde ela é admin.
 *
 * `admin` só vem com getParticipants=true. Isso importa porque tudo que o
 * rotador precisa do grupo — pegar o link de convite e receber o evento de
 * entrada — exige ser admin: sem isso o WhatsApp responde
 * "No invite code / forbidden".
 */
// Cache curto por instância: a chamada é cara (uma conta com grupos de 1500+
// membros passa de 2 min) e o usuário reabre o seletor várias vezes enquanto
// monta o rotador. Repetir a chamada não só demora como parece travar a
// Evolution — a segunda seguida costuma estourar o timeout.
const groupsCache = new Map<string, { at: number; groups: EvolutionGroup[] }>();
const GROUPS_TTL_MS = 120_000;

export function clearGroupsCache(instance: string) {
  groupsCache.delete(instance);
}

export async function fetchAllGroups(
  cfg: EvolutionConfig,
  name: string,
  ownerPhone: string | null,
  opts: { force?: boolean; timeoutMs?: number } = {}
): Promise<EvolutionGroup[]> {
  const hit = groupsCache.get(name);
  if (!opts.force && hit && Date.now() - hit.at < GROUPS_TTL_MS) return hit.groups;

  // Conexão pode estar sem telefone salvo (importada, ou conectada antes de o
  // campo ser preenchido). Sem ele não dá pra saber quem "eu" sou na lista de
  // participantes — então busca no próprio Evolution antes de desistir.
  let ownerDigits = (ownerPhone || '').replace(/\D/g, '');
  if (!ownerDigits) {
    ownerDigits = (await fetchInstancePhone(cfg, name).catch(() => null))?.replace(/\D/g, '') || '';
  }

  const data = await call(
    cfg,
    'GET',
    `/group/fetchAllGroups/${encodeURIComponent(name)}?getParticipants=true`,
    // Lenta por natureza. Quem chama de dentro de uma requisição usa o padrão
    // curto; o job em segundo plano manda um timeout longo, porque lá ninguém
    // está esperando na linha.
    { timeoutMs: opts.timeoutMs ?? 90_000 }
  );
  if (!Array.isArray(data)) return [];

  const groups: EvolutionGroup[] = data
    .map((g: any) => {
      // Participante traz `phoneNumber` (…@s.whatsapp.net) e `id` (…@lid).
      // Casa pelo telefone: o @lid é um id interno que não bate com o nosso.
      const me = ownerDigits
        ? (g.participants || []).find(
            (p: any) => String(p?.phoneNumber ?? '').replace(/\D/g, '') === ownerDigits
          )
        : null;
      // Sem telefone da instância, ou sem me achar entre os participantes, o
      // honesto é "não sei" — não "não é admin".
      const is_admin =
        !ownerDigits || !me ? null : me.admin === 'admin' || me.admin === 'superadmin';
      return {
        jid: String(g.id ?? ''),
        name: String(g.subject ?? '(sem nome)'),
        size: Number(g.size ?? 0),
        is_admin,
      };
    })
    .filter((g: EvolutionGroup) => g.jid.endsWith('@g.us'));

  groupsCache.set(name, { at: Date.now(), groups });
  return groups;
}

/**
 * Link de convite do grupo. Só funciona se a instância for admin — caso
 * contrário o Evolution devolve 404 com "No invite code / forbidden", que é
 * recusa do WhatsApp, não rota inexistente.
 */
export async function fetchGroupInviteUrl(
  cfg: EvolutionConfig,
  name: string,
  groupJid: string
): Promise<string | null> {
  const data = await call(
    cfg,
    'GET',
    `/group/inviteCode/${encodeURIComponent(name)}?groupJid=${encodeURIComponent(groupJid)}`
  ).catch(() => null);

  const code = data?.inviteCode ?? data?.code ?? null;
  return code ? `https://chat.whatsapp.com/${code}` : null;
}

/**
 * Resolve o JID do grupo (120363...@g.us) a partir do código do convite.
 * Aceita a URL completa ou só o código. Retorna null se o convite for inválido
 * ou o grupo não for acessível pela instância.
 */
export async function fetchGroupJidByInvite(
  cfg: EvolutionConfig,
  name: string,
  inviteUrlOrCode: string
): Promise<string | null> {
  const code = inviteUrlOrCode.replace(/^.*chat\.whatsapp\.com\/(?:invite\/)?/, '').trim();
  if (!code) return null;
  const data = await call(
    cfg,
    'GET',
    `/group/inviteInfo/${encodeURIComponent(name)}?inviteCode=${encodeURIComponent(code)}`
  ).catch(() => null);
  const jid = data?.id ?? data?.groupJid ?? null;
  return typeof jid === 'string' && jid.endsWith('@g.us') ? jid : null;
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

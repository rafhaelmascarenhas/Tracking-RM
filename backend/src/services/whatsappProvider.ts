import * as uaz from './uazapi';
import * as evo from './evolution';

/**
 * Facade de provider de WhatsApp. Despacha cada operação por `connection.provider`.
 *
 * Diferenças abstraídas aqui:
 *  - UazAPI: opera por TOKEN de instância (conn.uazapi_token); config = url + admin token.
 *  - Evolution: opera pelo NOME da instância (conn.session_name); config = url + apikey global.
 */

export type ConnRef = { provider: string; session_name: string; uazapi_token: string | null };
export type ProviderStatus = {
  status: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
  qrcode: string | null;
  phone: string | null;
  profileName: string | null;
};

/** Erro de provider unificado — qualquer um dos dois carrega `.status` HTTP. */
export function isProviderError(e: unknown): e is { status: number; message: string } {
  return e instanceof uaz.UazapiError || e instanceof evo.EvolutionError;
}

const isEvo = (provider: string) => provider === 'EVOLUTION';

/** Cria a instância no provider. Retorna o token (UazAPI) ou null (Evolution). */
export async function providerCreateInstance(
  workspaceId: string,
  provider: string,
  name: string
): Promise<{ token: string | null }> {
  if (isEvo(provider)) {
    const cfg = await evo.getWorkspaceEvolution(workspaceId);
    await evo.createInstance(cfg, name);
    return { token: null };
  }
  const cfg = await uaz.getWorkspaceUazapi(workspaceId);
  const token = await uaz.initInstance(cfg, name);
  return { token };
}

export async function providerSetWebhook(workspaceId: string, conn: ConnRef, url: string): Promise<void> {
  if (isEvo(conn.provider)) {
    const cfg = await evo.getWorkspaceEvolution(workspaceId);
    return evo.setWebhook(cfg, conn.session_name, url);
  }
  const cfg = await uaz.getWorkspaceUazapi(workspaceId);
  if (!conn.uazapi_token) throw new uaz.UazapiError('Conexão sem token uazapi.', 400);
  return uaz.setWebhook(cfg, conn.uazapi_token, url);
}

export async function providerConnect(workspaceId: string, conn: ConnRef): Promise<ProviderStatus> {
  if (isEvo(conn.provider)) {
    const cfg = await evo.getWorkspaceEvolution(workspaceId);
    return evo.connectInstance(cfg, conn.session_name);
  }
  const cfg = await uaz.getWorkspaceUazapi(workspaceId);
  if (!conn.uazapi_token) throw new uaz.UazapiError('Conexão sem token uazapi. Recrie o número.', 400);
  return uaz.connectInstance(cfg, conn.uazapi_token);
}

export async function providerStatus(workspaceId: string, conn: ConnRef): Promise<ProviderStatus> {
  if (isEvo(conn.provider)) {
    const cfg = await evo.getWorkspaceEvolution(workspaceId);
    return evo.getStatus(cfg, conn.session_name);
  }
  const cfg = await uaz.getWorkspaceUazapi(workspaceId);
  if (!conn.uazapi_token) throw new uaz.UazapiError('Conexão sem token uazapi.', 400);
  return uaz.getStatus(cfg, conn.uazapi_token);
}

export async function providerDisconnect(workspaceId: string, conn: ConnRef): Promise<void> {
  if (isEvo(conn.provider)) {
    const cfg = await evo.getWorkspaceEvolution(workspaceId);
    return evo.disconnectInstance(cfg, conn.session_name);
  }
  const cfg = await uaz.getWorkspaceUazapi(workspaceId);
  if (!conn.uazapi_token) return;
  return uaz.disconnectInstance(cfg, conn.uazapi_token);
}

export async function providerDelete(workspaceId: string, conn: ConnRef): Promise<void> {
  if (isEvo(conn.provider)) {
    const cfg = await evo.getWorkspaceEvolution(workspaceId);
    return evo.deleteInstance(cfg, conn.session_name);
  }
  const cfg = await uaz.getWorkspaceUazapi(workspaceId);
  if (!conn.uazapi_token) return;
  return uaz.deleteInstance(cfg, conn.uazapi_token);
}

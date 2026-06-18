import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  getWorkspaceUazapi,
  initInstance,
  setWebhook,
  connectInstance,
  getStatus,
  disconnectInstance,
  deleteInstance,
  UazapiError,
} from '../services/uazapi';

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const numbersRouter = Router();

// URL pública que a uazapi vai chamar. Em produção defina PUBLIC_BASE_URL.
function webhookUrl(req: Request): string {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/+$/, '')}/api/webhooks/whatsapp`;
}

function handleErr(res: Response, e: any) {
  if (e instanceof UazapiError) return res.status(e.status).json({ error: e.message });
  console.error('numbers route error:', e);
  return res.status(500).json({ error: 'Erro interno' });
}

// Persiste o estado retornado pela uazapi na conexão local.
async function syncConn(id: string, s: { status: string; phone?: string | null; profileName?: string | null }) {
  return prisma.whatsappConnection.update({
    where: { id },
    data: {
      status: s.status,
      ...(s.phone ? { phone_number: s.phone } : {}),
      ...(s.profileName ? { profile_name: s.profileName } : {}),
    },
  });
}

numbersRouter.get('/', async (req: Request, res: Response) => {
  const connections = await prisma.whatsappConnection.findMany({
    where: { workspace_id: req.workspaceId! },
    orderBy: { created_at: 'desc' },
  });
  res.json(connections);
});

numbersRouter.get('/:id', async (req: Request, res: Response) => {
  const conn = await prisma.whatsappConnection.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
    include: { workspace: true },
  });
  if (!conn) return res.status(404).json({ error: 'Not found' });
  res.json(conn);
});

// Cria a conexão: inicializa a instância na uazapi e já aponta o webhook.
numbersRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { session_name, phone_number } = req.body as { session_name?: string; phone_number?: string };
    if (!session_name?.trim()) return res.status(400).json({ error: 'Nome da sessão obrigatório' });
    const name = session_name.trim();

    const cfg = await getWorkspaceUazapi(req.workspaceId!);
    const token = await initInstance(cfg, name);
    await setWebhook(cfg, token, webhookUrl(req)).catch((e) => {
      console.warn('setWebhook falhou (segue mesmo assim):', e.message);
    });

    const conn = await prisma.whatsappConnection.create({
      data: {
        workspace_id: req.workspaceId!,
        session_name: name,
        phone_number: phone_number || null,
        uazapi_token: token,
        status: 'DISCONNECTED',
      },
    });
    res.status(201).json(conn);
  } catch (e) {
    handleErr(res, e);
  }
});

// Importa um número JÁ conectado na uazapi, usando o token da instância.
// Não lê QR e NÃO mexe no webhook (pra não roubar de outro sistema que use o
// mesmo número). Só registra a conexão pra ler/enviar via token.
numbersRouter.post('/import-token', async (req: Request, res: Response) => {
  try {
    const { session_name, uazapi_token } = req.body as { session_name?: string; uazapi_token?: string };
    const name = session_name?.trim();
    const token = uazapi_token?.trim();
    if (!name) return res.status(400).json({ error: 'Nome da sessão obrigatório' });
    if (!token || !TOKEN_RE.test(token)) {
      return res.status(400).json({ error: 'Token inválido. Cole o Instance Token da uazapi (formato UUID).' });
    }

    const cfg = await getWorkspaceUazapi(req.workspaceId!);

    // Valida o token consultando o status. Se for inválido, a uazapi retorna 401.
    let s;
    try {
      s = await getStatus(cfg, token);
    } catch (e: any) {
      const msg: string = e?.message || '';
      if (msg.includes('401') || /invalid token/i.test(msg)) {
        return res.status(400).json({ error: 'Token rejeitado pela uazapi (401). Confira se copiou o Instance Token certo.' });
      }
      throw e;
    }

    const conn = await prisma.whatsappConnection.create({
      data: {
        workspace_id: req.workspaceId!,
        session_name: name,
        phone_number: s.phone || null,
        profile_name: s.profileName || null,
        uazapi_token: token,
        status: s.status,
      },
    });
    res.status(201).json(conn);
  } catch (e) {
    handleErr(res, e);
  }
});

// Re-inicializa a instância na uazapi e atualiza o token no DB.
// Útil quando o token salvo fica inválido (ex: uazapi reiniciou e regenerou tokens).
numbersRouter.post('/:id/reinit', async (req: Request, res: Response) => {
  try {
    const conn = await prisma.whatsappConnection.findFirst({
      where: { id: req.params.id, workspace_id: req.workspaceId! },
    });
    if (!conn) return res.status(404).json({ error: 'Not found' });

    const cfg = await getWorkspaceUazapi(req.workspaceId!);
    const token = await initInstance(cfg, conn.session_name);

    await prisma.whatsappConnection.update({
      where: { id: conn.id },
      data: { uazapi_token: token },
    });

    await setWebhook(cfg, token, webhookUrl(req)).catch((e) => {
      console.warn('setWebhook pós-reinit falhou:', e.message);
    });

    res.json({ ok: true, token_updated: true });
  } catch (e) {
    handleErr(res, e);
  }
});

// Re-aplica o webhook na instância (corrige números criados antes do fix do endpoint).
numbersRouter.post('/:id/sync-webhook', async (req: Request, res: Response) => {
  try {
    const conn = await prisma.whatsappConnection.findFirst({
      where: { id: req.params.id, workspace_id: req.workspaceId! },
    });
    if (!conn) return res.status(404).json({ error: 'Not found' });
    if (!conn.uazapi_token) return res.status(400).json({ error: 'Conexão sem token uazapi.' });

    const cfg = await getWorkspaceUazapi(req.workspaceId!);
    const url = webhookUrl(req);
    await setWebhook(cfg, conn.uazapi_token, url);
    res.json({ ok: true, webhook_url: url });
  } catch (e) {
    handleErr(res, e);
  }
});

// Inicia conexão e devolve o QR code pra escanear.
numbersRouter.post('/:id/connect', async (req: Request, res: Response) => {
  try {
    const conn = await prisma.whatsappConnection.findFirst({
      where: { id: req.params.id, workspace_id: req.workspaceId! },
    });
    if (!conn) return res.status(404).json({ error: 'Not found' });
    if (!conn.uazapi_token) return res.status(400).json({ error: 'Conexão sem token uazapi. Recrie o número.' });

    const cfg = await getWorkspaceUazapi(req.workspaceId!);
    const s = await connectInstance(cfg, conn.uazapi_token);
    await syncConn(conn.id, s);
    res.json(s);
  } catch (e) {
    handleErr(res, e);
  }
});

// Polling de status (frontend chama enquanto o QR está aberto).
numbersRouter.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const conn = await prisma.whatsappConnection.findFirst({
      where: { id: req.params.id, workspace_id: req.workspaceId! },
    });
    if (!conn) return res.status(404).json({ error: 'Not found' });
    if (!conn.uazapi_token) return res.json({ status: conn.status, qrcode: null });

    const cfg = await getWorkspaceUazapi(req.workspaceId!);
    const s = await getStatus(cfg, conn.uazapi_token);
    await syncConn(conn.id, s);
    res.json(s);
  } catch (e) {
    handleErr(res, e);
  }
});

numbersRouter.post('/:id/disconnect', async (req: Request, res: Response) => {
  try {
    const conn = await prisma.whatsappConnection.findFirst({
      where: { id: req.params.id, workspace_id: req.workspaceId! },
    });
    if (!conn) return res.status(404).json({ error: 'Not found' });
    if (conn.uazapi_token) {
      const cfg = await getWorkspaceUazapi(req.workspaceId!);
      await disconnectInstance(cfg, conn.uazapi_token).catch((e) => console.warn('disconnect:', e.message));
    }
    const updated = await prisma.whatsappConnection.update({
      where: { id: conn.id },
      data: { status: 'DISCONNECTED' },
    });
    res.json(updated);
  } catch (e) {
    handleErr(res, e);
  }
});

// Edição manual (telefone, nome de sessão).
numbersRouter.put('/:id', async (req: Request, res: Response) => {
  const conn = await prisma.whatsappConnection.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
  });
  if (!conn) return res.status(404).json({ error: 'Not found' });

  const { session_name, phone_number } = req.body as { session_name?: string; phone_number?: string };
  const updated = await prisma.whatsappConnection.update({
    where: { id: conn.id },
    data: {
      session_name: session_name ?? conn.session_name,
      phone_number: phone_number ?? conn.phone_number,
    },
  });
  res.json(updated);
});

numbersRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const conn = await prisma.whatsappConnection.findFirst({
      where: { id: req.params.id, workspace_id: req.workspaceId! },
    });
    if (!conn) return res.status(404).json({ error: 'Not found' });

    if (conn.uazapi_token) {
      const cfg = await getWorkspaceUazapi(req.workspaceId!).catch(() => null);
      if (cfg) await deleteInstance(cfg, conn.uazapi_token).catch((e) => console.warn('deleteInstance:', e.message));
    }
    await prisma.whatsappConnection.delete({ where: { id: conn.id } });
    res.json({ ok: true });
  } catch (e) {
    handleErr(res, e);
  }
});

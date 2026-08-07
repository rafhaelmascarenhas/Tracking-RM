import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getWorkspaceUazapi, getStatus as uazapiGetStatus, initInstance, setWebhook as uazapiSetWebhook } from '../services/uazapi';
import {
  isProviderError,
  providerCreateInstance,
  providerSetWebhook,
  providerConnect,
  providerStatus,
  providerLiveState,
  providerDisconnect,
  providerDelete,
} from '../services/whatsappProvider';

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const numbersRouter = Router();

// URL pública que a uazapi vai chamar. Em produção defina PUBLIC_BASE_URL.
function webhookUrl(req: Request): string {
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/+$/, '')}/api/webhooks/whatsapp`;
}

function handleErr(res: Response, e: any) {
  if (isProviderError(e)) return res.status(e.status).json({ error: e.message });
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

/**
 * Lista os números conferindo o estado REAL no provider, não a coluna do banco.
 *
 * `status` só era escrito na criação e nos webhooks CONNECTION_UPDATE. Quando a
 * sessão cai sem o provider entregar o evento (queda do webhook, instância presa
 * em `connecting` depois de um QR lido pela metade), a coluna congela em
 * CONNECTED e a tela mostra verde pra um número que não recebe mensagem nenhuma.
 * Foi assim que o tracking-adler apareceu "Conectado" estando em `connecting`.
 *
 * Falha do provider não derruba a listagem: cai pro valor do banco e marca
 * `status_stale` pra tela poder avisar que não deu pra confirmar.
 */
numbersRouter.get('/', async (req: Request, res: Response) => {
  const connections = await prisma.whatsappConnection.findMany({
    where: { workspace_id: req.workspaceId! },
    orderBy: { created_at: 'desc' },
  });

  const live = await Promise.all(
    connections.map(async (c) => {
      if (c.provider === 'MANUAL') return { ...c, status_stale: false };
      try {
        const status = await providerLiveState(req.workspaceId!, {
          provider: c.provider,
          session_name: c.session_name,
          uazapi_token: c.uazapi_token,
        });
        if (status !== c.status) {
          await prisma.whatsappConnection.update({ where: { id: c.id }, data: { status } });
        }
        return { ...c, status, status_stale: false };
      } catch (e: any) {
        console.warn(`[numbers] estado ao vivo de "${c.session_name}" falhou: ${e.message}`);
        return { ...c, status_stale: true };
      }
    })
  );

  res.json(live);
});

// Mesmo tratamento da listagem: estado ao vivo, não a coluna do banco.
numbersRouter.get('/:id', async (req: Request, res: Response) => {
  const conn = await prisma.whatsappConnection.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
    include: { workspace: true },
  });
  if (!conn) return res.status(404).json({ error: 'Not found' });
  if (conn.provider === 'MANUAL') return res.json({ ...conn, status_stale: false });

  try {
    const status = await providerLiveState(req.workspaceId!, {
      provider: conn.provider,
      session_name: conn.session_name,
      uazapi_token: conn.uazapi_token,
    });
    if (status !== conn.status) {
      await prisma.whatsappConnection.update({ where: { id: conn.id }, data: { status } });
    }
    res.json({ ...conn, status, status_stale: false });
  } catch (e: any) {
    console.warn(`[numbers] estado ao vivo de "${conn.session_name}" falhou: ${e.message}`);
    res.json({ ...conn, status_stale: true });
  }
});

/**
 * Reaponta o webhook da instância com a lista de eventos ATUAL do código.
 * Instância criada antes de um evento novo entrar (ex: GROUP_PARTICIPANTS_UPDATE)
 * fica assinada só nos antigos — o provider não atualiza sozinho, e a falta do
 * evento é silenciosa: nenhum erro, só contagem parada em zero.
 */
numbersRouter.post('/:id/resync-webhook', async (req: Request, res: Response) => {
  try {
    const conn = await prisma.whatsappConnection.findFirst({
      where: { id: req.params.id, workspace_id: req.workspaceId! },
    });
    if (!conn) return res.status(404).json({ error: 'Not found' });

    await providerSetWebhook(
      req.workspaceId!,
      { provider: conn.provider, session_name: conn.session_name, uazapi_token: conn.uazapi_token },
      webhookUrl(req)
    );
    res.json({ ok: true, webhook: webhookUrl(req) });
  } catch (e) {
    handleErr(res, e);
  }
});

// Cria a conexão: inicializa a instância na uazapi e já aponta o webhook.
numbersRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { session_name, phone_number, provider } = req.body as {
      session_name?: string;
      phone_number?: string;
      provider?: string;
    };
    if (!session_name?.trim()) return res.status(400).json({ error: 'Nome da sessão obrigatório' });
    const name = session_name.trim();
    const prov = provider === 'EVOLUTION' ? 'EVOLUTION' : 'UAZAPI';

    const { token } = await providerCreateInstance(req.workspaceId!, prov, name);
    await providerSetWebhook(req.workspaceId!, { provider: prov, session_name: name, uazapi_token: token }, webhookUrl(req)).catch((e) => {
      console.warn('setWebhook falhou (segue mesmo assim):', e.message);
    });

    const conn = await prisma.whatsappConnection.create({
      data: {
        workspace_id: req.workspaceId!,
        provider: prov,
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

// Cadastra um número "manual": só o telefone, sem instância em nenhum provider.
// Serve pra entrar no rodízio do rotador (o link wa.me é montado com o telefone).
// Não recebe webhook, então não há matching de conversa nem status de sessão.
numbersRouter.post('/manual', async (req: Request, res: Response) => {
  const { session_name, phone_number } = req.body as { session_name?: string; phone_number?: string };
  const name = session_name?.trim();
  const digits = (phone_number || '').replace(/\D/g, '');

  if (!name) return res.status(400).json({ error: 'Nome da sessão obrigatório' });
  if (digits.length < 10 || digits.length > 15) {
    return res.status(400).json({ error: 'Telefone inválido. Use DDI+DDD+número (ex: 5511999998888).' });
  }

  const conn = await prisma.whatsappConnection.create({
    data: {
      workspace_id: req.workspaceId!,
      provider: 'MANUAL',
      session_name: name,
      phone_number: digits,
      status: 'MANUAL',
      is_imported: true, // não tenta apagar instância no provider ao deletar
    },
  });
  res.status(201).json(conn);
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
      s = await uazapiGetStatus(cfg, token);
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
        is_imported: true,
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
    if (conn.provider === 'EVOLUTION') {
      return res.status(400).json({ error: 'reinit não se aplica ao Evolution (sem token de instância). Use reconectar.' });
    }
    if (conn.provider === 'MANUAL') {
      return res.status(400).json({ error: 'reinit não se aplica a número manual.' });
    }

    const cfg = await getWorkspaceUazapi(req.workspaceId!);
    const token = await initInstance(cfg, conn.session_name);

    await prisma.whatsappConnection.update({
      where: { id: conn.id },
      data: { uazapi_token: token },
    });

    await uazapiSetWebhook(cfg, token, webhookUrl(req)).catch((e) => {
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
    if (conn.provider === 'MANUAL') {
      return res.status(400).json({ error: 'Número manual não tem webhook.' });
    }

    const url = webhookUrl(req);
    await providerSetWebhook(req.workspaceId!, conn, url);
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
    if (conn.provider === 'MANUAL') {
      return res.status(400).json({ error: 'Número manual não tem sessão pra conectar.' });
    }

    const s = await providerConnect(req.workspaceId!, conn);
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
    if (conn.provider === 'MANUAL') return res.json({ status: conn.status, qrcode: null });
    if (conn.provider !== 'EVOLUTION' && !conn.uazapi_token) return res.json({ status: conn.status, qrcode: null });

    // Sempre pergunta ao provider. Já teve atalho respondendo CONNECTED direto do
    // banco quando havia telefone salvo: como só o inbound grava CONNECTED e nada
    // grava DISCONNECTED, o número podia cair (sessão em "connecting" no Evolution)
    // e o painel jurar verde pra sempre, escondendo horas de mensagem perdida.
    const s = await providerStatus(req.workspaceId!, conn);
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
    await providerDisconnect(req.workspaceId!, conn).catch((e) => console.warn('disconnect:', e.message));
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

    if (!conn.is_imported) {
      await providerDelete(req.workspaceId!, conn).catch((e) => console.warn('deleteInstance:', e.message));
    }
    await prisma.whatsappConnection.delete({ where: { id: conn.id } });
    res.json({ ok: true });
  } catch (e) {
    handleErr(res, e);
  }
});

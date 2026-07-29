import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { normalizeInviteUrl } from '../services/groupRotatorService';
import {
  fetchAllGroups,
  fetchGroupInviteUrl,
  fetchGroupJidByInvite,
  fetchInstancePhone,
  getWorkspaceEvolution,
} from '../services/evolution';

export const groupRotatorsRouter = Router();

type TargetInput = {
  name?: string;
  invite_url: string;
  weight?: number;
  priority?: number;
  active?: boolean;
  max_clicks?: number | null;
  // Vem preenchido quando o grupo foi escolhido pela lista do número, e aí a
  // contagem de membros já funciona sem passar pelo "Vincular grupos".
  group_jid?: string | null;
};

// Aceita link completo, sem https ou só o código do convite. Descarta inválidos.
function buildTargets(targets: TargetInput[]) {
  if (!Array.isArray(targets)) return [];
  // group_jid é unique: o mesmo grupo entrando duas vezes derrubaria o
  // createMany inteiro. Fica só a primeira ocorrência.
  const seenJids = new Set<string>();
  return targets
    .map((t, i) => {
      const invite_url = normalizeInviteUrl(t.invite_url);
      if (!invite_url) return null;
      let group_jid = t.group_jid || null;
      if (group_jid) {
        if (seenJids.has(group_jid)) group_jid = null;
        else seenJids.add(group_jid);
      }
      return {
        name: t.name || '',
        invite_url,
        weight: t.weight ?? 1,
        priority: t.priority ?? i,
        active: t.active !== false,
        max_clicks: t.max_clicks == null ? null : Math.max(1, Number(t.max_clicks)),
        group_jid,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}

// ATENÇÃO: rotas de caminho fixo têm que vir ANTES de '/:id', senão o Express
// casa '/available-groups' como se 'available-groups' fosse um id e responde 404.

/**
 * Lista os grupos do número escolhido, pra montar o rotador escolhendo de uma
 * lista em vez de colar link por link copiado do celular.
 *
 * Grupos onde o número não é admin vêm marcados, não escondidos: o usuário
 * precisa entender POR QUE aquele grupo não serve, senão fica procurando um
 * grupo que "sumiu" da lista.
 */
groupRotatorsRouter.get('/available-groups', async (req: Request, res: Response) => {
  const connectionId = String(req.query.connection_id || '');
  if (!connectionId) return res.status(400).json({ error: 'connection_id é obrigatório' });

  const conn = await prisma.whatsappConnection.findFirst({
    where: { id: connectionId, workspace_id: req.workspaceId! },
    select: { session_name: true, provider: true, status: true, phone_number: true },
  });
  if (!conn) return res.status(404).json({ error: 'Número não encontrado' });
  if (conn.provider !== 'EVOLUTION') {
    return res.status(400).json({ error: 'Listar grupos só funciona com número Evolution.' });
  }
  if (conn.status !== 'CONNECTED') {
    return res.status(400).json({ error: 'Número desconectado. Reconecte para listar os grupos.' });
  }

  try {
    const cfg = await getWorkspaceEvolution(req.workspaceId!);

    // Telefone faltando é o que quebra a detecção de admin. Busca e persiste,
    // pra não repetir a chamada extra a cada abertura do seletor.
    let phone = conn.phone_number;
    if (!phone) {
      phone = await fetchInstancePhone(cfg, conn.session_name).catch(() => null);
      if (phone) {
        await prisma.whatsappConnection.update({
          where: { id: connectionId },
          data: { phone_number: phone },
        });
      }
    }

    const groups = await fetchAllGroups(cfg, conn.session_name, phone, {
      force: req.query.refresh === '1',
    });
    // Admin primeiro, indeterminado depois, e não-admin por último; dentro de
    // cada faixa, os maiores primeiro.
    const rank = (g: { is_admin: boolean | null }) => (g.is_admin === true ? 0 : g.is_admin === null ? 1 : 2);
    groups.sort((a, b) => rank(a) - rank(b) || b.size - a.size);

    res.json({
      groups,
      phone_number: phone,
      // Zero admin é um resultado comum e confuso: sem isso a tela vira uma
      // lista inteira desabilitada sem explicação no topo.
      admin_count: groups.filter((g) => g.is_admin === true).length,
      unknown_count: groups.filter((g) => g.is_admin === null).length,
    });
  } catch (e: any) {
    res.status(e.status ?? 502).json({ error: e.message });
  }
});

/** Link de convite de um grupo específico. Exige o número ser admin dele. */
groupRotatorsRouter.post('/group-invite', async (req: Request, res: Response) => {
  const { connection_id, group_jid } = req.body as { connection_id?: string; group_jid?: string };
  if (!connection_id || !group_jid) {
    return res.status(400).json({ error: 'connection_id e group_jid são obrigatórios' });
  }

  const conn = await prisma.whatsappConnection.findFirst({
    where: { id: connection_id, workspace_id: req.workspaceId! },
    select: { session_name: true, provider: true },
  });
  if (!conn || conn.provider !== 'EVOLUTION') {
    return res.status(400).json({ error: 'Número inválido para esta operação.' });
  }

  try {
    const cfg = await getWorkspaceEvolution(req.workspaceId!);
    const invite_url = await fetchGroupInviteUrl(cfg, conn.session_name, group_jid);
    if (!invite_url) {
      return res.status(400).json({
        error: 'O WhatsApp não liberou o link deste grupo. Confirme que o número é admin dele.',
      });
    }
    res.json({ invite_url, group_jid });
  } catch (e: any) {
    res.status(e.status ?? 502).json({ error: e.message });
  }
});

groupRotatorsRouter.get('/', async (req: Request, res: Response) => {
  const rotators = await prisma.groupRotator.findMany({
    where: { workspace_id: req.workspaceId! },
    orderBy: { created_at: 'desc' },
    include: { _count: { select: { clicks: true, targets: true } } },
  });
  res.json(rotators);
});

groupRotatorsRouter.get('/:id', async (req: Request, res: Response) => {
  const rotator = await prisma.groupRotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
    include: {
      targets: { orderBy: { priority: 'asc' } },
      _count: { select: { clicks: true } },
    },
  });
  if (!rotator) return res.status(404).json({ error: 'Not found' });
  res.json(rotator);
});

groupRotatorsRouter.get('/:id/clicks', async (req: Request, res: Response) => {
  const rotator = await prisma.groupRotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
    select: { id: true },
  });
  if (!rotator) return res.status(404).json({ error: 'Not found' });

  const take = Math.min(parseInt(String(req.query.take || '50'), 10) || 50, 200);
  const skip = parseInt(String(req.query.skip || '0'), 10) || 0;
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to) + 'T23:59:59') : undefined;

  const clicks = await prisma.groupClick.findMany({
    where: {
      rotator_id: rotator.id,
      ...(from || to
        ? { created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    orderBy: { created_at: 'desc' },
    take,
    skip,
    include: { target: { select: { name: true, invite_url: true } } },
  });

  res.json(clicks);
});

groupRotatorsRouter.post('/', async (req: Request, res: Response) => {
  const {
    name,
    distribution = 'ROUND_ROBIN',
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    use_landing = false,
    landing_logo = null,
    landing_title = null,
    landing_cta = null,
    redirect_seconds,
    meta_pixel_id = null,
    meta_capi_token = null,
    gtm_id = null,
    connection_id = null,
    targets = [],
  } = req.body as { targets?: TargetInput[] } & Record<string, any>;

  if (!name) return res.status(400).json({ error: 'name é obrigatório' });

  const builtTargets = buildTargets(targets);
  if (builtTargets.length === 0) {
    return res.status(400).json({ error: 'informe ao menos 1 link de grupo válido' });
  }

  const rotator = await prisma.groupRotator.create({
    data: {
      workspace_id: req.workspaceId!,
      short_code: crypto.randomBytes(4).toString('hex'),
      name,
      distribution,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_term: utm_term || null,
      utm_content: utm_content || null,
      use_landing,
      landing_logo,
      landing_title,
      landing_cta,
      redirect_seconds:
        redirect_seconds == null ? 3 : Math.max(0, Math.min(60, Number(redirect_seconds))),
      meta_pixel_id: meta_pixel_id || null,
      meta_capi_token: meta_capi_token || null,
      gtm_id: gtm_id || null,
      connection_id: connection_id || null,
      targets: { create: builtTargets },
    },
    include: { targets: true },
  });

  res.status(201).json(rotator);
});

groupRotatorsRouter.put('/:id', async (req: Request, res: Response) => {
  const existing = await prisma.groupRotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const {
    name,
    distribution,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    active,
    use_landing,
    landing_logo,
    landing_title,
    landing_cta,
    redirect_seconds,
    meta_pixel_id,
    meta_capi_token,
    gtm_id,
    connection_id,
    targets,
  } = req.body as { targets?: TargetInput[] } & Record<string, any>;

  // Recria os targets se vierem no payload. Preserva clicks_count por invite_url
  // pra edição não zerar o corte de grupo lotado.
  if (Array.isArray(targets)) {
    const builtTargets = buildTargets(targets);
    if (builtTargets.length === 0) {
      return res.status(400).json({ error: 'informe ao menos 1 link de grupo válido' });
    }
    const old = await prisma.groupTarget.findMany({
      where: { rotator_id: existing.id },
      select: { invite_url: true, clicks_count: true, group_jid: true },
    });
    const counts = Object.fromEntries(old.map((t) => [t.invite_url, t.clicks_count]));
    // group_jid também sobrevive à edição: perdê-lo desliga a contagem de membros
    // do grupo e deixa as entradas novas órfãs de target.
    const jids = Object.fromEntries(old.map((t) => [t.invite_url, t.group_jid]));

    await prisma.groupTarget.deleteMany({ where: { rotator_id: existing.id } });
    await prisma.groupTarget.createMany({
      data: builtTargets.map((t) => ({
        ...t,
        rotator_id: existing.id,
        clicks_count: counts[t.invite_url] ?? 0,
        // JID que veio do payload (grupo escolhido pela lista) manda; senão
        // preserva o que já estava salvo pra aquele convite.
        group_jid: t.group_jid ?? jids[t.invite_url] ?? null,
      })),
    });

    // deleteMany zerou o target_id dos membros (onDelete: SetNull). Reata pelo JID.
    const recreated = await prisma.groupTarget.findMany({
      where: { rotator_id: existing.id, group_jid: { not: null } },
      select: { id: true, group_jid: true },
    });
    for (const t of recreated) {
      await prisma.groupMember.updateMany({
        where: { group_jid: t.group_jid! },
        data: { target_id: t.id, rotator_id: existing.id },
      });
    }
  }

  const rotator = await prisma.groupRotator.update({
    where: { id: existing.id },
    data: {
      name: name ?? existing.name,
      distribution: distribution ?? existing.distribution,
      utm_source: utm_source ?? existing.utm_source,
      utm_medium: utm_medium ?? existing.utm_medium,
      utm_campaign: utm_campaign ?? existing.utm_campaign,
      utm_term: utm_term ?? existing.utm_term,
      utm_content: utm_content ?? existing.utm_content,
      active: typeof active === 'boolean' ? active : existing.active,
      use_landing: typeof use_landing === 'boolean' ? use_landing : existing.use_landing,
      landing_logo: landing_logo !== undefined ? landing_logo : existing.landing_logo,
      landing_title: landing_title !== undefined ? landing_title : existing.landing_title,
      landing_cta: landing_cta !== undefined ? landing_cta : existing.landing_cta,
      redirect_seconds:
        redirect_seconds == null
          ? existing.redirect_seconds
          : Math.max(0, Math.min(60, Number(redirect_seconds))),
      meta_pixel_id: meta_pixel_id !== undefined ? meta_pixel_id || null : existing.meta_pixel_id,
      meta_capi_token:
        meta_capi_token !== undefined ? meta_capi_token || null : existing.meta_capi_token,
      gtm_id: gtm_id !== undefined ? gtm_id || null : existing.gtm_id,
      // Diferencia "não mandou o campo" de "mandou vazio pra desvincular".
      connection_id: connection_id !== undefined ? connection_id || null : existing.connection_id,
    },
    include: { targets: true },
  });

  res.json(rotator);
});

/**
 * Resolve o JID de cada grupo do rotador a partir do link de convite.
 * Sem JID o evento de entrada chega mas não sabe a que target pertence.
 * Idempotente: só toca nos targets que ainda estão sem JID.
 *
 * Exige o número escolhido no rotador: Evolution (a uazapi não expõe inviteInfo)
 * e conectado. Cada erro possível responde a causa específica, porque "não
 * resolveu" tem quatro motivos diferentes e o usuário não adivinha qual foi.
 */
groupRotatorsRouter.post('/:id/resolve-jids', async (req: Request, res: Response) => {
  const rotator = await prisma.groupRotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
    select: { id: true, connection_id: true },
  });
  if (!rotator) return res.status(404).json({ error: 'Not found' });

  // Usa o número escolhido no rotador. Escolher sozinho um número qualquer do
  // workspace seria um sorteio silencioso: só funciona se aquela instância for
  // admin dos grupos, e o usuário não teria como corrigir a escolha.
  if (!rotator.connection_id) {
    return res.status(400).json({
      error: 'Escolha um número no rotador (aba Geral) antes de vincular os grupos.',
    });
  }

  const conn = await prisma.whatsappConnection.findFirst({
    where: { id: rotator.connection_id, workspace_id: req.workspaceId! },
    select: { session_name: true, provider: true, status: true, phone_number: true },
  });
  if (!conn) {
    return res.status(400).json({ error: 'O número do rotador não existe mais. Escolha outro.' });
  }
  if (conn.provider !== 'EVOLUTION') {
    return res.status(400).json({
      error: 'A contagem de membros só funciona com número Evolution. A uazapi não expõe os dados do grupo.',
    });
  }
  if (conn.status !== 'CONNECTED') {
    return res.status(400).json({
      error: `O número ${conn.phone_number || conn.session_name} está desconectado. Reconecte antes de vincular.`,
    });
  }

  let cfg;
  try {
    cfg = await getWorkspaceEvolution(req.workspaceId!);
  } catch (e: any) {
    return res.status(e.status ?? 502).json({ error: e.message });
  }

  const pending = await prisma.groupTarget.findMany({
    where: { rotator_id: rotator.id, group_jid: null },
    select: { id: true, invite_url: true },
  });

  const results: { target_id: string; group_jid: string | null }[] = [];
  for (const t of pending) {
    const jid = await fetchGroupJidByInvite(cfg, conn.session_name, t.invite_url).catch(() => null);
    if (jid) {
      // Outro target pode já ter esse JID (mesmo grupo cadastrado 2x) — group_jid
      // é unique, então ignora o conflito em vez de derrubar a rota inteira.
      await prisma.groupTarget
        .update({ where: { id: t.id }, data: { group_jid: jid } })
        .catch(() => null);
      await prisma.groupMember.updateMany({
        where: { group_jid: jid },
        data: { target_id: t.id, rotator_id: rotator.id },
      });
    }
    results.push({ target_id: t.id, group_jid: jid });
  }

  res.json({ ok: true, resolved: results.filter((r) => r.group_jid).length, results });
});

/**
 * Contagem de entradas por grupo. `members` = quem está dentro agora,
 * `joined_total` = entradas históricas (inclui quem já saiu).
 */
groupRotatorsRouter.get('/:id/members', async (req: Request, res: Response) => {
  const rotator = await prisma.groupRotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
    select: { id: true },
  });
  if (!rotator) return res.status(404).json({ error: 'Not found' });

  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to) + 'T23:59:59') : undefined;
  const period =
    from || to ? { joined_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

  const targets = await prisma.groupTarget.findMany({
    where: { rotator_id: rotator.id },
    orderBy: { priority: 'asc' },
    select: { id: true, name: true, invite_url: true, group_jid: true, clicks_count: true },
  });

  const byTarget = await Promise.all(
    targets.map(async (t) => {
      const [joined, inside] = await Promise.all([
        prisma.groupMember.count({ where: { target_id: t.id, ...period } }),
        prisma.groupMember.count({ where: { target_id: t.id, left_at: null, ...period } }),
      ]);
      return {
        ...t,
        // JID nulo = evento de entrada não consegue ser atribuído a este grupo.
        tracking_ready: t.group_jid != null,
        joined_total: joined,
        members: inside,
      };
    })
  );

  // Entradas que chegaram antes do JID ser resolvido ficam sem target.
  const orphans = await prisma.groupMember.count({
    where: { workspace_id: req.workspaceId!, target_id: null, ...period },
  });

  res.json({
    targets: byTarget,
    totals: {
      joined_total: byTarget.reduce((s, t) => s + t.joined_total, 0),
      members: byTarget.reduce((s, t) => s + t.members, 0),
      clicks: byTarget.reduce((s, t) => s + t.clicks_count, 0),
      unattributed_joins: orphans,
    },
  });
});

// Zera o contador de um grupo — usado quando o grupo é esvaziado/trocado.
groupRotatorsRouter.post('/:id/targets/:targetId/reset', async (req: Request, res: Response) => {
  const rotator = await prisma.groupRotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
    select: { id: true },
  });
  if (!rotator) return res.status(404).json({ error: 'Not found' });

  const result = await prisma.groupTarget.updateMany({
    where: { id: req.params.targetId, rotator_id: rotator.id },
    data: { clicks_count: 0 },
  });
  if (result.count === 0) return res.status(404).json({ error: 'Target not found' });
  res.json({ ok: true });
});

groupRotatorsRouter.delete('/:id', async (req: Request, res: Response) => {
  const rotator = await prisma.groupRotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
  });
  if (!rotator) return res.status(404).json({ error: 'Not found' });

  await prisma.groupRotator.delete({ where: { id: rotator.id } });
  res.json({ ok: true });
});

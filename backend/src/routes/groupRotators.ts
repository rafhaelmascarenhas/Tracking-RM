import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { normalizeInviteUrl } from '../services/groupRotatorService';

export const groupRotatorsRouter = Router();

type TargetInput = {
  name?: string;
  invite_url: string;
  weight?: number;
  priority?: number;
  active?: boolean;
  max_clicks?: number | null;
};

// Aceita link completo, sem https ou só o código do convite. Descarta inválidos.
function buildTargets(targets: TargetInput[]) {
  if (!Array.isArray(targets)) return [];
  return targets
    .map((t, i) => {
      const invite_url = normalizeInviteUrl(t.invite_url);
      if (!invite_url) return null;
      return {
        name: t.name || '',
        invite_url,
        weight: t.weight ?? 1,
        priority: t.priority ?? i,
        active: t.active !== false,
        max_clicks: t.max_clicks == null ? null : Math.max(1, Number(t.max_clicks)),
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);
}

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
      select: { invite_url: true, clicks_count: true },
    });
    const counts = Object.fromEntries(old.map((t) => [t.invite_url, t.clicks_count]));

    await prisma.groupTarget.deleteMany({ where: { rotator_id: existing.id } });
    await prisma.groupTarget.createMany({
      data: builtTargets.map((t) => ({
        ...t,
        rotator_id: existing.id,
        clicks_count: counts[t.invite_url] ?? 0,
      })),
    });
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
    },
    include: { targets: true },
  });

  res.json(rotator);
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

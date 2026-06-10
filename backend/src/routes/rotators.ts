import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';

export const rotatorsRouter = Router();

type TargetInput = { connection_id: string; weight?: number; priority?: number };

// Garante uma TrackableMessage com base_text = prefilled_text + as UTMs do rotador,
// pra que o matching existente no webhook atribua a campanha automaticamente.
async function syncTrackableMessage(rotator: {
  workspace_id: string;
  prefilled_text: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
}) {
  const existing = await prisma.trackableMessage.findFirst({
    where: { workspace_id: rotator.workspace_id, base_text: rotator.prefilled_text },
  });
  const data = {
    utm_source: rotator.utm_source,
    utm_medium: rotator.utm_medium,
    utm_campaign: rotator.utm_campaign,
    utm_term: rotator.utm_term,
    utm_content: rotator.utm_content,
  };
  if (existing) {
    await prisma.trackableMessage.update({ where: { id: existing.id }, data });
  } else {
    await prisma.trackableMessage.create({
      data: { workspace_id: rotator.workspace_id, base_text: rotator.prefilled_text, ...data },
    });
  }
}

// Valida que as conexões pertencem ao workspace e monta os RotatorTargets.
async function buildTargets(workspaceId: string, targets: TargetInput[]) {
  if (!Array.isArray(targets) || targets.length === 0) return [];
  const ids = targets.map((t) => t.connection_id);
  const owned = await prisma.whatsappConnection.findMany({
    where: { id: { in: ids }, workspace_id: workspaceId },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((c) => c.id));
  return targets
    .filter((t) => ownedSet.has(t.connection_id))
    .map((t, i) => ({
      connection_id: t.connection_id,
      weight: t.weight ?? 1,
      priority: t.priority ?? i,
    }));
}

rotatorsRouter.get('/', async (req: Request, res: Response) => {
  const rotators = await prisma.rotator.findMany({
    where: { workspace_id: req.workspaceId! },
    orderBy: { created_at: 'desc' },
    include: { _count: { select: { clicks: true, targets: true } } },
  });

  const matchedCounts = await prisma.rotatorClick.groupBy({
    by: ['rotator_id'],
    where: { rotator_id: { in: rotators.map((r) => r.id) }, status: 'matched' },
    _count: { id: true },
  });
  const matchedMap = Object.fromEntries(matchedCounts.map((m) => [m.rotator_id, m._count.id]));

  res.json(rotators.map((r) => ({ ...r, _matched_clicks: matchedMap[r.id] ?? 0 })));
});

rotatorsRouter.get('/:id', async (req: Request, res: Response) => {
  const rotator = await prisma.rotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
    include: {
      targets: { include: { connection: true } },
      _count: { select: { clicks: true } },
    },
  });
  if (!rotator) return res.status(404).json({ error: 'Not found' });
  res.json(rotator);
});

rotatorsRouter.get('/:id/clicks', async (req: Request, res: Response) => {
  const rotator = await prisma.rotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
    select: { id: true },
  });
  if (!rotator) return res.status(404).json({ error: 'Not found' });

  const take = Math.min(parseInt(String(req.query.take || '50'), 10) || 50, 200);
  const skip = parseInt(String(req.query.skip || '0'), 10) || 0;
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to) + 'T23:59:59') : undefined;

  const clicks = await prisma.rotatorClick.findMany({
    where: {
      rotator_id: rotator.id,
      ...(from || to ? { created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: { created_at: 'desc' },
    take,
    skip,
  });
  res.json(clicks);
});

rotatorsRouter.post('/', async (req: Request, res: Response) => {
  const {
    name,
    distribution = 'ROUND_ROBIN',
    prefilled_text,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    use_landing = false,
    landing_logo = null,
    landing_title = null,
    landing_cta = null,
    hide_token = false,
    distribute_offline = false,
    redirect_seconds,
    targets = [],
  } = req.body as { targets?: TargetInput[] } & Record<string, any>;

  if (!name || !prefilled_text) {
    return res.status(400).json({ error: 'name e prefilled_text são obrigatórios' });
  }

  const short_code = crypto.randomBytes(4).toString('hex');
  const builtTargets = await buildTargets(req.workspaceId!, targets);

  const rotator = await prisma.rotator.create({
    data: {
      workspace_id: req.workspaceId!,
      short_code,
      name,
      distribution,
      prefilled_text,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_term: utm_term || null,
      utm_content: utm_content || null,
      use_landing,
      landing_logo,
      landing_title,
      landing_cta,
      hide_token,
      distribute_offline,
      redirect_seconds: redirect_seconds == null ? 3 : Math.max(0, Math.min(60, Number(redirect_seconds))),
      targets: { create: builtTargets },
    },
    include: { targets: true },
  });

  await syncTrackableMessage(rotator);
  res.status(201).json(rotator);
});

rotatorsRouter.put('/:id', async (req: Request, res: Response) => {
  const existing = await prisma.rotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const {
    name,
    distribution,
    prefilled_text,
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
    hide_token,
    distribute_offline,
    redirect_seconds,
    targets,
  } = req.body as { targets?: TargetInput[] } & Record<string, any>;

  // Recria os targets se vierem no payload
  if (Array.isArray(targets)) {
    const builtTargets = await buildTargets(req.workspaceId!, targets);
    await prisma.rotatorTarget.deleteMany({ where: { rotator_id: existing.id } });
    await prisma.rotatorTarget.createMany({
      data: builtTargets.map((t) => ({ ...t, rotator_id: existing.id })),
    });
  }

  const rotator = await prisma.rotator.update({
    where: { id: existing.id },
    data: {
      name: name ?? existing.name,
      distribution: distribution ?? existing.distribution,
      prefilled_text: prefilled_text ?? existing.prefilled_text,
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
      hide_token: typeof hide_token === 'boolean' ? hide_token : existing.hide_token,
      distribute_offline: typeof distribute_offline === 'boolean' ? distribute_offline : existing.distribute_offline,
      redirect_seconds: redirect_seconds == null ? existing.redirect_seconds : Math.max(0, Math.min(60, Number(redirect_seconds))),
    },
    include: { targets: true },
  });

  await syncTrackableMessage(rotator);
  res.json(rotator);
});

rotatorsRouter.delete('/:id', async (req: Request, res: Response) => {
  const rotator = await prisma.rotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
  });
  if (!rotator) return res.status(404).json({ error: 'Not found' });

  await prisma.rotator.delete({ where: { id: rotator.id } });
  res.json({ ok: true });
});

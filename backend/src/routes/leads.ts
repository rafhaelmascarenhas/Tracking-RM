import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { enqueueCapiEvent } from '../lib/queue';

export const leadsRouter = Router();

const LIMIT_MAX = 200;
const LIMIT_DEFAULT = 50;
const META_SOURCES = ['meta', 'Meta', 'facebook', 'Facebook', 'instagram', 'Instagram', 'fb', 'ig'];

leadsRouter.get('/', async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limit = Math.min(LIMIT_MAX, Math.max(1, parseInt(req.query.limit as string) || LIMIT_DEFAULT));
  const search   = ((req.query.search   as string) || '').trim();
  const dateFrom = (req.query.dateFrom  as string) || '';
  const dateTo   = (req.query.dateTo    as string) || '';

  // Where com filtros da tabela (busca + datas)
  const where: any = { workspace_id: req.workspaceId! };
  if (search) {
    where.OR = [
      { phone_number: { contains: search } },
      { name: { contains: search } },
    ];
  }
  if (dateFrom || dateTo) {
    where.created_at = {};
    if (dateFrom) where.created_at.gte = new Date(dateFrom);
    if (dateTo)   where.created_at.lte = new Date(dateTo + 'T23:59:59');
  }

  // Stats globais (sem filtros de busca/data — visão geral permanente)
  const statsBase = { workspace_id: req.workspaceId! };
  const [statsTotal, statsMeta, statsUntracked, total, leads] = await Promise.all([
    prisma.lead.count({ where: statsBase }),
    prisma.lead.count({
      where: {
        ...statsBase,
        OR: [
          { fbclid: { not: null } },
          { ctwa_clid: { not: null } },
          { utm_source: { in: META_SOURCES } },
        ],
      },
    }),
    prisma.lead.count({
      where: { ...statsBase, fbclid: null, ctwa_clid: null, utm_source: null },
    }),
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      include: {
        journeyStage: true,
        whatsappConnection: { select: { session_name: true, phone_number: true } },
      },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  res.json({
    leads,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    limit,
    stats: { total: statsTotal, meta: statsMeta, untracked: statsUntracked },
  });
});

leadsRouter.get('/:lead_id', async (req: Request, res: Response) => {
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.lead_id, workspace_id: req.workspaceId! },
    include: {
      journeyStage: true,
      messages: { orderBy: { timestamp: 'asc' } },
      whatsappConnection: { select: { session_name: true, phone_number: true } },
    },
  });
  if (!lead) return res.status(404).json({ error: 'Not found' });

  const click = await prisma.rotatorClick.findFirst({
    where: { lead_id: lead.id },
    orderBy: { matched_at: 'desc' },
    include: { rotator: { select: { name: true } } },
  });

  let origin: {
    rotator_name: string | null;
    served_by: { session_name: string; phone_number: string | null } | null;
    meta_attributed: boolean;
  } | null = null;

  if (click) {
    const conn = await prisma.whatsappConnection.findUnique({
      where: { id: click.connection_id },
      select: { session_name: true, phone_number: true },
    });
    origin = {
      rotator_name: click.rotator?.name ?? null,
      served_by: conn,
      meta_attributed: !!click.fbclid,
    };
  } else if (lead.whatsappConnection) {
    origin = {
      rotator_name: null,
      served_by: lead.whatsappConnection,
      meta_attributed: false,
    };
  }

  res.json({ ...lead, origin });
});

leadsRouter.patch('/:lead_id/stage', async (req: Request, res: Response) => {
  const { lead_id } = req.params;
  const { stage_id, value } = req.body as { stage_id: string; value?: number | string | null };
  const overrideValue = value === '' || value == null ? null : Number(value);

  const lead = await prisma.lead.findFirst({
    where: { id: lead_id, workspace_id: req.workspaceId! },
  });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const updated = await prisma.lead.update({
    where: { id: lead_id },
    data: { current_journey_stage_id: stage_id },
  });

  const events = await prisma.conversionEvent.findMany({
    where: { journey_stage_id: stage_id },
  });

  for (const event of events) {
    await enqueueCapiEvent({
      leadId: lead_id,
      eventName: event.event_name,
      platform: event.platform,
      workspaceId: req.workspaceId!,
      value: overrideValue ?? event.value,
      currency: event.currency,
    });
  }

  res.json(updated);
});

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const pixelFiresRouter = Router();

const PAGE_SIZE = 50;

// Monta o filtro de disparos a partir dos query params (data + tipo de evento + origem).
// from/to = 'YYYY-MM-DD' (interpretado em BRT). event = nome do evento ('all' = todos).
// origin = 'rotator' | 'ctwa' | 'all' — filtra pelos leads que vieram do rotador (fbclid) ou de CTWA (ctwa_clid).
async function buildWhere(req: Request) {
  const where: Record<string, unknown> = { workspace_id: req.workspaceId! };
  const from = typeof req.query.from === 'string' ? req.query.from : '';
  const to = typeof req.query.to === 'string' ? req.query.to : '';
  const event = typeof req.query.event === 'string' ? req.query.event : '';
  const origin = typeof req.query.origin === 'string' ? req.query.origin : '';
  if (from || to) {
    const fired: Record<string, Date> = {};
    if (from) fired.gte = new Date(`${from}T00:00:00-03:00`);
    if (to) fired.lte = new Date(`${to}T23:59:59-03:00`);
    where.fired_at = fired;
  }
  if (event && event !== 'all') where.event_name = event;
  if (origin === 'rotator' || origin === 'ctwa') {
    const leads = await prisma.lead.findMany({
      where: {
        workspace_id: req.workspaceId!,
        ...(origin === 'rotator' ? { fbclid: { not: null } } : { ctwa_clid: { not: null } }),
      },
      select: { id: true },
    });
    where.lead_id = { in: leads.map((l) => l.id) };
  }
  return where;
}

// Disparos de pixel do workspace, paginado, com lead + etapa pra exibição.
pixelFiresRouter.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const where = await buildWhere(req);

  const [total, fires, eventGroups] = await Promise.all([
    prisma.pixelFire.count({ where }),
    prisma.pixelFire.findMany({
      where,
      orderBy: { fired_at: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    // Tipos de evento existentes no workspace — alimenta o dropdown de filtro.
    prisma.pixelFire.groupBy({
      by: ['event_name'],
      where: { workspace_id: req.workspaceId! },
    }),
  ]);

  const leadIds = [...new Set(fires.map((f) => f.lead_id))];
  const stageIds = [...new Set(fires.map((f) => f.journey_stage_id).filter(Boolean) as string[])];
  const [leads, stages] = await Promise.all([
    prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true, phone_number: true } }),
    prisma.journeyStage.findMany({ where: { id: { in: stageIds } }, select: { id: true, name: true } }),
  ]);
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  res.json({
    items: fires.map((f) => ({
      ...f,
      lead: leadMap.get(f.lead_id) ?? null,
      stage: f.journey_stage_id ? stageMap.get(f.journey_stage_id) ?? null : null,
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    eventTypes: eventGroups.map((g) => g.event_name).sort(),
  });
});

// Exporta os disparos filtrados em CSV (sem paginação) — botão "Baixar dados".
pixelFiresRouter.get('/export', async (req: Request, res: Response) => {
  const where = await buildWhere(req);
  const fires = await prisma.pixelFire.findMany({ where, orderBy: { fired_at: 'desc' }, take: 10000 });
  const leadIds = [...new Set(fires.map((f) => f.lead_id))];
  const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true, phone_number: true } });
  const leadMap = new Map(leads.map((l) => [l.id, l]));

  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['data', 'nome', 'telefone', 'evento', 'plataforma', 'action_source', 'valor', 'moeda', 'status', 'resposta'];
  const rows = fires.map((f) => {
    const l = leadMap.get(f.lead_id);
    return [
      new Date(f.fired_at).toISOString(),
      l?.name ?? '',
      l?.phone_number ?? '',
      f.event_name,
      f.platform,
      f.action_source ?? '',
      f.value ?? '',
      f.currency ?? '',
      f.status,
      f.response ?? '',
    ].map(esc).join(',');
  });
  const csv = '﻿' + [header.map(esc).join(','), ...rows].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="disparos-pixel-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const reportsRouter = Router();

// GET /api/reports/rotators?from=YYYY-MM-DD&to=YYYY-MM-DD
// Retorna resumo de cliques dos rotadores com filtro de data.
reportsRouter.get('/rotators', async (req: Request, res: Response) => {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to) + 'T23:59:59') : undefined;
  const dateFilter = from || to
    ? { created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
    : {};

  const rotators = await prisma.rotator.findMany({
    where: { workspace_id: req.workspaceId! },
    orderBy: { created_at: 'desc' },
    select: { id: true, name: true, short_code: true, distribution: true, active: true },
  });

  const results = await Promise.all(rotators.map(async (r) => {
    const [total, matched] = await Promise.all([
      prisma.rotatorClick.count({ where: { rotator_id: r.id, ...dateFilter } }),
      prisma.rotatorClick.count({ where: { rotator_id: r.id, status: 'matched', ...dateFilter } }),
    ]);
    return { ...r, total_clicks: total, matched_clicks: matched, pending_clicks: total - matched };
  }));

  const totalClicks = results.reduce((s, r) => s + r.total_clicks, 0);
  const totalMatched = results.reduce((s, r) => s + r.matched_clicks, 0);

  res.json({
    summary: {
      total_clicks: totalClicks,
      matched_clicks: totalMatched,
      pending_clicks: totalClicks - totalMatched,
      match_rate: totalClicks > 0 ? Math.round((totalMatched / totalClicks) * 100) : 0,
    },
    rotators: results,
  });
});

// GET /api/reports/rotators/:id/timeline?from=&to=&groupBy=day|week
// Cliques por dia para gráfico de linha.
reportsRouter.get('/rotators/:id/timeline', async (req: Request, res: Response) => {
  const rotator = await prisma.rotator.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
    select: { id: true },
  });
  if (!rotator) return res.status(404).json({ error: 'Not found' });

  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const to = req.query.to ? new Date(String(req.query.to) + 'T23:59:59') : new Date();

  const clicks = await prisma.rotatorClick.findMany({
    where: { rotator_id: rotator.id, created_at: { gte: from, lte: to } },
    select: { status: true, created_at: true },
    orderBy: { created_at: 'asc' },
  });

  // Group by day
  const byDay: Record<string, { total: number; matched: number }> = {};
  for (const c of clicks) {
    const day = c.created_at.toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { total: 0, matched: 0 };
    byDay[day].total++;
    if (c.status === 'matched') byDay[day].matched++;
  }

  res.json(Object.entries(byDay).map(([date, v]) => ({ date, ...v })));
});

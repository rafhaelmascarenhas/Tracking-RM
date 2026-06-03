import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const dashboardRouter = Router();

dashboardRouter.get('/stats', async (req: Request, res: Response) => {
  const workspaceId = req.workspaceId!;
  const { from, to } = req.query;

  const dateFilter = {
    gte: from ? new Date(from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    lte: to ? new Date(to as string) : new Date(),
  };

  const [totalLeads, trackedLeads, stages, leadsByDay] = await Promise.all([
    prisma.lead.count({
      where: { workspace_id: workspaceId, created_at: dateFilter },
    }),
    prisma.lead.count({
      where: { workspace_id: workspaceId, created_at: dateFilter, utm_source: { not: null } },
    }),
    // Funnel: count leads per journey stage
    prisma.journeyStage.findMany({
      where: { workspace_id: workspaceId },
      include: { _count: { select: { leads: true } } },
      orderBy: { order_index: 'asc' },
    }),
    // Daily conversations
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT strftime('%Y-%m-%d', created_at) as date, COUNT(*) as count
      FROM leads
      WHERE workspace_id = ${workspaceId}
        AND created_at >= ${dateFilter.gte}
        AND created_at <= ${dateFilter.lte}
      GROUP BY strftime('%Y-%m-%d', created_at)
      ORDER BY date ASC
    `,
  ]);

  // Source breakdown
  const sourceBreakdown = await prisma.lead.groupBy({
    by: ['utm_source'],
    where: { workspace_id: workspaceId, created_at: dateFilter },
    _count: true,
  });

  res.json({
    total_conversations: totalLeads,
    tracked: trackedLeads,
    untracked: totalLeads - trackedLeads,
    tracked_pct: totalLeads ? Math.round((trackedLeads / totalLeads) * 100) : 0,
    funnel: stages.map((s) => ({ name: s.name, count: s._count.leads, order: s.order_index })),
    source_breakdown: sourceBreakdown.map((s) => ({
      source: s.utm_source || 'Não Rastreada',
      count: s._count,
    })),
    chart: leadsByDay.map((r) => ({ date: r.date, count: Number(r.count) })),
  });
});

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const pixelFiresRouter = Router();

// Últimos 50 disparos de pixel do workspace, com lead + etapa pra exibição.
pixelFiresRouter.get('/', async (req: Request, res: Response) => {
  const fires = await prisma.pixelFire.findMany({
    where: { workspace_id: req.workspaceId! },
    orderBy: { fired_at: 'desc' },
    take: 50,
  });

  const leadIds = [...new Set(fires.map((f) => f.lead_id))];
  const stageIds = [...new Set(fires.map((f) => f.journey_stage_id).filter(Boolean) as string[])];
  const [leads, stages] = await Promise.all([
    prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true, phone_number: true } }),
    prisma.journeyStage.findMany({ where: { id: { in: stageIds } }, select: { id: true, name: true } }),
  ]);
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  res.json(
    fires.map((f) => ({
      ...f,
      lead: leadMap.get(f.lead_id) ?? null,
      stage: f.journey_stage_id ? stageMap.get(f.journey_stage_id) ?? null : null,
    }))
  );
});

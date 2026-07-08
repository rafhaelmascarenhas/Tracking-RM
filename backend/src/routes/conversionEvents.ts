import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const conversionEventsRouter = Router();

conversionEventsRouter.get('/', async (req: Request, res: Response) => {
  const events = await prisma.conversionEvent.findMany({
    where: { journeyStage: { workspace_id: req.workspaceId! } },
    include: { journeyStage: true },
  });
  res.json(events);
});

conversionEventsRouter.post('/', async (req: Request, res: Response) => {
  const { journey_stage_id, platform, event_name, value, currency } = req.body;

  const stage = await prisma.journeyStage.findFirst({
    where: { id: journey_stage_id, workspace_id: req.workspaceId! },
  });
  if (!stage) return res.status(404).json({ error: 'Stage not found' });

  const event = await prisma.conversionEvent.create({
    data: {
      journey_stage_id,
      platform,
      event_name,
      value: value === '' || value == null ? null : Number(value),
      currency: currency || 'BRL',
    },
  });
  res.status(201).json(event);
});

conversionEventsRouter.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { platform, event_name, value, currency, journey_stage_id } = req.body;

  const event = await prisma.conversionEvent.findFirst({
    where: { id, journeyStage: { workspace_id: req.workspaceId! } },
  });
  if (!event) return res.status(404).json({ error: 'Not found' });

  // Se mudou a etapa, valida que a nova é do mesmo workspace.
  if (journey_stage_id && journey_stage_id !== event.journey_stage_id) {
    const stage = await prisma.journeyStage.findFirst({
      where: { id: journey_stage_id, workspace_id: req.workspaceId! },
    });
    if (!stage) return res.status(404).json({ error: 'Stage not found' });
  }

  const updated = await prisma.conversionEvent.update({
    where: { id },
    data: {
      ...(platform ? { platform } : {}),
      ...(event_name ? { event_name } : {}),
      ...(journey_stage_id ? { journey_stage_id } : {}),
      ...(currency ? { currency } : {}),
      value: value === '' || value == null ? null : Number(value),
    },
  });
  res.json(updated);
});

conversionEventsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const event = await prisma.conversionEvent.findFirst({
    where: { id, journeyStage: { workspace_id: req.workspaceId! } },
  });
  if (!event) return res.status(404).json({ error: 'Not found' });

  await prisma.conversionEvent.delete({ where: { id } });
  res.json({ ok: true });
});

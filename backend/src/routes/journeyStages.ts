import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const journeyStagesRouter = Router();

journeyStagesRouter.get('/', async (req: Request, res: Response) => {
  const stages = await prisma.journeyStage.findMany({
    where: { workspace_id: req.workspaceId! },
    include: { conversionEvents: true },
    orderBy: { order_index: 'asc' },
  });
  res.json(stages);
});

journeyStagesRouter.post('/', async (req: Request, res: Response) => {
  const { name, order_index, keyword, is_sale, is_first_contact } = req.body;
  const stage = await prisma.journeyStage.create({
    data: {
      workspace_id: req.workspaceId!,
      name,
      order_index: order_index ?? 0,
      keyword: keyword?.trim() || null,
      is_sale: !!is_sale,
      is_first_contact: !!is_first_contact,
    },
  });
  res.status(201).json(stage);
});

// Bulk reorder (drag-and-drop). DEVE vir antes de '/:id' senão o Express casa
// PUT /reorder no handler '/:id' (id='reorder').
journeyStagesRouter.put('/reorder', async (req: Request, res: Response) => {
  const { order }: { order: { id: string; order_index: number }[] } = req.body;
  await Promise.all(
    order.map((item) =>
      prisma.journeyStage.updateMany({
        where: { id: item.id, workspace_id: req.workspaceId! },
        data: { order_index: item.order_index },
      })
    )
  );
  res.json({ ok: true });
});

journeyStagesRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, order_index, keyword, is_sale, is_first_contact } = req.body;

  const stage = await prisma.journeyStage.findFirst({
    where: { id, workspace_id: req.workspaceId! },
  });
  if (!stage) return res.status(404).json({ error: 'Not found' });

  const updated = await prisma.journeyStage.update({
    where: { id },
    data: {
      name,
      order_index,
      keyword: keyword?.trim() || null,
      is_sale: !!is_sale,
      is_first_contact: !!is_first_contact,
    },
  });
  res.json(updated);
});

journeyStagesRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const stage = await prisma.journeyStage.findFirst({
    where: { id, workspace_id: req.workspaceId! },
  });
  if (!stage) return res.status(404).json({ error: 'Not found' });
  if (stage.system_default) return res.status(403).json({ error: 'Cannot delete system stage' });

  await prisma.journeyStage.delete({ where: { id } });
  res.json({ ok: true });
});

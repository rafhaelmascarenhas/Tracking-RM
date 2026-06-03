import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const trackableMessagesRouter = Router();

trackableMessagesRouter.get('/', async (req: Request, res: Response) => {
  const messages = await prisma.trackableMessage.findMany({
    where: { workspace_id: req.workspaceId! },
    orderBy: { created_at: 'desc' },
  });
  res.json(messages);
});

trackableMessagesRouter.post('/', async (req: Request, res: Response) => {
  const { base_text, utm_source, utm_medium, utm_campaign, utm_term, utm_content } = req.body;
  const msg = await prisma.trackableMessage.create({
    data: {
      workspace_id: req.workspaceId!,
      base_text,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
    },
  });
  res.status(201).json(msg);
});

trackableMessagesRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const msg = await prisma.trackableMessage.findFirst({
    where: { id, workspace_id: req.workspaceId! },
  });
  if (!msg) return res.status(404).json({ error: 'Not found' });

  const updated = await prisma.trackableMessage.update({
    where: { id },
    data: req.body,
  });
  res.json(updated);
});

trackableMessagesRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const msg = await prisma.trackableMessage.findFirst({
    where: { id, workspace_id: req.workspaceId! },
  });
  if (!msg) return res.status(404).json({ error: 'Not found' });

  await prisma.trackableMessage.delete({ where: { id } });
  res.json({ ok: true });
});

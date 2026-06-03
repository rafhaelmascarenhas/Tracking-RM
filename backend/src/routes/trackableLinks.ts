import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';

export const trackableLinksRouter = Router();

trackableLinksRouter.get('/', async (req: Request, res: Response) => {
  const links = await prisma.trackableLink.findMany({
    where: { workspace_id: req.workspaceId! },
    orderBy: { created_at: 'desc' },
  });
  res.json(links);
});

trackableLinksRouter.post('/', async (req: Request, res: Response) => {
  const { destination_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content } = req.body;
  const short_code = crypto.randomBytes(4).toString('hex');

  const link = await prisma.trackableLink.create({
    data: {
      workspace_id: req.workspaceId!,
      short_code,
      destination_url,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
    },
  });
  res.status(201).json(link);
});

trackableLinksRouter.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await prisma.trackableLink.findFirst({ where: { id, workspace_id: req.workspaceId! } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { destination_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content } = req.body;
  const link = await prisma.trackableLink.update({
    where: { id },
    data: { destination_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content },
  });
  res.json(link);
});

trackableLinksRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const link = await prisma.trackableLink.findFirst({
    where: { id, workspace_id: req.workspaceId! },
  });
  if (!link) return res.status(404).json({ error: 'Not found' });

  await prisma.trackableLink.delete({ where: { id } });
  res.json({ ok: true });
});

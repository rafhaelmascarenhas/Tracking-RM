import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const triggersRouter = Router();

triggersRouter.get('/', async (req: Request, res: Response) => {
  const triggers = await prisma.conversionTrigger.findMany({
    where: { workspace_id: req.workspaceId! },
    orderBy: { created_at: 'desc' },
    include: { _count: { select: { fired: true } } },
  });
  res.json(triggers);
});

triggersRouter.post('/', async (req: Request, res: Response) => {
  const { name, platform, event_name, value, currency, trigger_type, phrase, direction, only_rotator } = req.body;

  if (!name || !event_name || !trigger_type) {
    return res.status(400).json({ error: 'name, event_name e trigger_type são obrigatórios' });
  }
  if (trigger_type === 'phrase' && !phrase?.trim()) {
    return res.status(400).json({ error: 'phrase é obrigatória quando trigger_type = phrase' });
  }

  const trigger = await prisma.conversionTrigger.create({
    data: {
      workspace_id: req.workspaceId!,
      name,
      platform: platform || 'META',
      event_name,
      value: value === '' || value == null ? null : Number(value),
      currency: currency || 'BRL',
      trigger_type,
      phrase: trigger_type === 'phrase' ? phrase.trim() : null,
      direction: direction || 'any',
      only_rotator: !!only_rotator,
    },
  });
  res.status(201).json(trigger);
});

triggersRouter.put('/:id', async (req: Request, res: Response) => {
  const existing = await prisma.conversionTrigger.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
  });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, platform, event_name, value, currency, trigger_type, phrase, direction, only_rotator, active } = req.body;

  const trigger = await prisma.conversionTrigger.update({
    where: { id: existing.id },
    data: {
      name: name ?? existing.name,
      platform: platform ?? existing.platform,
      event_name: event_name ?? existing.event_name,
      value: value === '' ? null : value == null ? existing.value : Number(value),
      currency: currency ?? existing.currency,
      trigger_type: trigger_type ?? existing.trigger_type,
      phrase: trigger_type === 'phrase' ? (phrase ?? existing.phrase) : trigger_type === 'conversation_open' ? null : existing.phrase,
      direction: direction ?? existing.direction,
      only_rotator: typeof only_rotator === 'boolean' ? only_rotator : existing.only_rotator,
      active: typeof active === 'boolean' ? active : existing.active,
    },
  });
  res.json(trigger);
});

triggersRouter.delete('/:id', async (req: Request, res: Response) => {
  const trigger = await prisma.conversionTrigger.findFirst({
    where: { id: req.params.id, workspace_id: req.workspaceId! },
  });
  if (!trigger) return res.status(404).json({ error: 'Not found' });
  await prisma.conversionTrigger.delete({ where: { id: trigger.id } });
  res.json({ ok: true });
});

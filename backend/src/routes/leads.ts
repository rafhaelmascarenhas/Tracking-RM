import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { enqueueCapiEvent } from '../lib/queue';

export const leadsRouter = Router();

leadsRouter.get('/', async (req: Request, res: Response) => {
  const leads = await prisma.lead.findMany({
    where: { workspace_id: req.workspaceId! },
    include: { journeyStage: true },
    orderBy: { created_at: 'desc' },
  });
  res.json(leads);
});

leadsRouter.get('/:lead_id', async (req: Request, res: Response) => {
  const lead = await prisma.lead.findFirst({
    where: { id: req.params.lead_id, workspace_id: req.workspaceId! },
    include: {
      journeyStage: true,
      messages: { orderBy: { timestamp: 'asc' } },
    },
  });
  if (!lead) return res.status(404).json({ error: 'Not found' });

  // Origem do rotador (qual número atendeu + atribuição Meta)
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

  // Trigger conversion events for this stage
  const events = await prisma.conversionEvent.findMany({
    where: { journey_stage_id: stage_id },
  });

  for (const event of events) {
    await enqueueCapiEvent({
      leadId: lead_id,
      eventName: event.event_name,
      platform: event.platform,
      workspaceId: req.workspaceId!,
      // valor por lead (override) tem prioridade sobre o valor padrão do evento
      value: overrideValue ?? event.value,
      currency: event.currency,
    });
  }

  res.json(updated);
});

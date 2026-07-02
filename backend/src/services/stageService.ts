import { prisma } from '../lib/prisma';
import { enqueueCapiEvent } from '../lib/queue';

/**
 * Move um lead pra uma etapa da jornada e dispara os conversionEvents dela.
 * Fonte única usada por: marcação manual no painel E termo-chave no webhook.
 *
 * mode:
 *  - 'auto'   (termo-chave): dedupe por lead+etapa — dispara os eventos só 1x.
 *             Se repetir o termo, move a etapa mas NÃO redispara.
 *  - 'manual' (painel): sempre dispara (ação explícita do usuário), e registra
 *             o StageFired pra um termo-chave posterior não duplicar.
 */
export async function applyStageToLead(opts: {
  workspaceId: string;
  leadId: string;
  stageId: string;
  overrideValue?: number | null;
  mode: 'auto' | 'manual';
}): Promise<{ moved: boolean; fired: number }> {
  const { workspaceId, leadId, stageId, overrideValue, mode } = opts;

  await prisma.lead.update({
    where: { id: leadId },
    data: { current_journey_stage_id: stageId },
  });

  let alreadyFired = false;
  if (mode === 'auto') {
    // Cria o registro de dedupe; se já existe (unique violation), já disparou antes.
    try {
      await prisma.stageFired.create({ data: { lead_id: leadId, journey_stage_id: stageId } });
    } catch {
      alreadyFired = true;
    }
  } else {
    // Manual sempre dispara, mas garante o registro pra bloquear termo-chave futuro.
    await prisma.stageFired.upsert({
      where: { lead_id_journey_stage_id: { lead_id: leadId, journey_stage_id: stageId } },
      create: { lead_id: leadId, journey_stage_id: stageId },
      update: {},
    });
  }

  if (alreadyFired) return { moved: true, fired: 0 };

  const events = await prisma.conversionEvent.findMany({ where: { journey_stage_id: stageId } });
  for (const ev of events) {
    await enqueueCapiEvent({
      leadId,
      eventName: ev.event_name,
      platform: ev.platform,
      workspaceId,
      value: overrideValue ?? ev.value,
      currency: ev.currency,
      journeyStageId: stageId,
    });
  }
  return { moved: true, fired: events.length };
}

/**
 * Procura uma etapa cujo termo-chave apareça no texto (substring, case-insensitive)
 * e aplica ao lead via applyStageToLead(mode='auto'). Chamado no webhook quando o
 * ATENDENTE (fromMe) manda mensagem. Retorna a etapa aplicada ou null.
 */
export async function applyKeywordStage(opts: {
  workspaceId: string;
  leadId: string;
  text: string;
}): Promise<{ id: string; name: string } | null> {
  const { workspaceId, leadId, text } = opts;
  const lower = (text || '').toLowerCase();
  if (!lower.trim()) return null;

  const stages = await prisma.journeyStage.findMany({
    where: { workspace_id: workspaceId, keyword: { not: null } },
    orderBy: { order_index: 'asc' },
  });

  const match = stages.find((s) => {
    const kw = (s.keyword || '').toLowerCase().trim();
    return kw.length > 0 && lower.includes(kw);
  });
  if (!match) return null;

  const r = await applyStageToLead({ workspaceId, leadId, stageId: match.id, mode: 'auto' });
  console.log(`[stage] keyword move lead=${leadId} -> "${match.name}" fired=${r.fired}`);
  return { id: match.id, name: match.name };
}

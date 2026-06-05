import { prisma } from '../lib/prisma';
import { enqueueCapiEvent } from '../lib/queue';

/**
 * Avalia os gatilhos de conversão do workspace contra uma mensagem.
 * Dispara fireMetaCapi (via fila) quando bate, 1x por lead+gatilho.
 *
 * @param direction 'lead' (inbound) | 'attendant' (outbound/fromMe)
 * @param hasAttribution true se o lead tem fbclid (veio do rotador)
 */
export async function evaluateTriggers(opts: {
  workspaceId: string;
  leadId: string;
  text: string;
  direction: 'lead' | 'attendant';
  hasAttribution: boolean;
}) {
  const { workspaceId, leadId, text, direction, hasAttribution } = opts;

  const triggers = await prisma.conversionTrigger.findMany({
    where: { workspace_id: workspaceId, active: true },
  });
  if (triggers.length === 0) return;

  const lowerText = (text || '').toLowerCase();

  for (const t of triggers) {
    // Filtro de direção (quem manda a frase)
    if (t.direction !== 'any' && t.direction !== direction) continue;

    // Só leads atribuídos (rotador), se marcado
    if (t.only_rotator && !hasAttribution) continue;

    // Condição do gatilho
    let matches = false;
    if (t.trigger_type === 'conversation_open') {
      // Abrir conversa = qualquer mensagem do lead. Dedupe garante 1x.
      matches = direction === 'lead';
    } else if (t.trigger_type === 'phrase' && t.phrase) {
      matches = lowerText.includes(t.phrase.toLowerCase());
    }
    if (!matches) continue;

    // Dedupe: tenta criar o registro; se já existe, pula.
    try {
      await prisma.conversionFired.create({
        data: { trigger_id: t.id, lead_id: leadId },
      });
    } catch {
      continue; // unique violation = já disparou pra esse lead
    }

    await enqueueCapiEvent({
      leadId,
      eventName: t.event_name,
      platform: t.platform,
      workspaceId,
      value: t.value,
      currency: t.currency,
    });
    console.log(`[trigger] FIRED ${t.event_name} (${t.name}) lead=${leadId} dir=${direction}`);
  }
}

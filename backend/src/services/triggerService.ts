import { prisma } from '../lib/prisma';
import { enqueueCapiEvent } from '../lib/queue';

/**
 * Extrai valor monetário (R$) do texto. Usado em gatilhos de frase (ex: Purchase)
 * onde o valor é relativo e escrito na própria msg do atendente, ex:
 * "Parabéns pela sua compra no valor de 349,00".
 * Prioriza R$ e "valor", depois qualquer número com centavos. Formato BR
 * (ponto = milhar, vírgula = decimal). Retorna null se não achar valor confiável.
 */
export function parseMoneyBR(text: string): number | null {
  if (!text) return null;
  // Número BR: ou grupos de milhar com ponto (1.349), ou inteiro puro (2500); decimais ,## opcionais.
  const patterns = [
    /r\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?)/i,                  // R$ 1.349,90 | R$ 349 | R$ 2500
    /valor\s+(?:de\s+)?r?\$?\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?)/i, // valor de 349,00 | valor 2500
    /((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})/,                             // qualquer 349,00 | 1.349,90
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const raw = m[1].replace(/\./g, '').replace(',', '.');
      const v = parseFloat(raw);
      if (!isNaN(v) && v > 0) return v;
    }
  }
  return null;
}

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

  // Qual rotador originou esse lead (se houver) — pra escopo por rotador.
  let leadRotatorId: string | null = null;
  if (triggers.some((t) => t.rotator_id)) {
    const click = await prisma.rotatorClick.findFirst({
      where: { lead_id: leadId, status: 'matched' },
      orderBy: { matched_at: 'desc' },
      select: { rotator_id: true },
    });
    leadRotatorId = click?.rotator_id ?? null;
  }

  const lowerText = (text || '').toLowerCase();

  for (const t of triggers) {
    // Filtro de direção (quem manda a frase)
    if (t.direction !== 'any' && t.direction !== direction) continue;

    // Escopo: rotador específico > qualquer rotador > todos
    if (t.rotator_id) {
      if (leadRotatorId !== t.rotator_id) continue;
    } else if (t.only_rotator && !hasAttribution) {
      continue;
    }

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

    // Valor relativo: gatilho de frase tenta extrair o valor escrito na msg
    // (ex: "...compra no valor de 349,00"). Fallback pro valor fixo da config.
    let value = t.value;
    if (t.trigger_type === 'phrase') {
      const parsed = parseMoneyBR(text);
      if (parsed != null) value = parsed;
    }

    await enqueueCapiEvent({
      leadId,
      eventName: t.event_name,
      platform: t.platform,
      workspaceId,
      value,
      currency: t.currency,
    });
    console.log(`[trigger] FIRED ${t.event_name} (${t.name}) lead=${leadId} dir=${direction} value=${value ?? '-'}`);
  }
}

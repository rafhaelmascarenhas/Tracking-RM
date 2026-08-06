/**
 * Backfill de Purchase perdido enquanto o gatilho ficou desativado.
 *
 * O gatilho "Compra" ficou active=false de 02/07 a 06/08/2026: toda mensagem
 * do atendente com "Parabéns pela sua compra" passou batido, nenhum Purchase
 * foi pro Meta. Este script varre as mensagens OUTBOUND salvas, casa com o
 * gatilho de frase do workspace e dispara o que faltou.
 *
 * Limite duro: a Meta recusa evento com event_time acima de 7 dias
 * (erro 2804003). Nada anterior a isso dá pra recuperar — por padrão a janela
 * é 6d20h pra sobrar folga até o evento sair da fila.
 *
 * Uso (rodar de backend/, com o dist buildado):
 *   node scripts/backfill-purchase.js            # dry-run, só lista
 *   node scripts/backfill-purchase.js --apply    # dispara de verdade
 *   node scripts/backfill-purchase.js --days=3 --apply
 */

const { PrismaClient } = require('@prisma/client');
const { normalizeForMatch, parseMoneyBR } = require('../dist/services/triggerService');
const { enqueueCapiEvent } = require('../dist/lib/queue');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const daysArg = args.find((a) => a.startsWith('--days='));
// 6d20h: 7 dias é o teto da Meta, a folga cobre o tempo de fila.
const WINDOW_MS = daysArg ? Number(daysArg.split('=')[1]) * 864e5 : 6.83 * 864e5;

async function main() {
  const cutoff = new Date(Date.now() - WINDOW_MS);
  console.log(`janela: desde ${cutoff.toISOString()} | modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const triggers = await prisma.conversionTrigger.findMany({
    where: { active: true, trigger_type: 'phrase', platform: 'META' },
  });
  if (!triggers.length) {
    console.log('nenhum gatilho de frase ativo — nada a fazer');
    return;
  }

  // Filtro largo no banco (SQLite não normaliza acento); o casamento real é em JS.
  const msgs = await prisma.message.findMany({
    where: { direction: 'OUTBOUND', timestamp: { gte: cutoff } },
    orderBy: { timestamp: 'asc' },
    include: {
      lead: {
        select: {
          id: true,
          workspace_id: true,
          phone_number: true,
          fbclid: true,
          ctwa_clid: true,
          click_time: true,
        },
      },
    },
  });
  console.log(`mensagens OUTBOUND na janela: ${msgs.length}`);

  const planned = [];
  const seen = new Set(); // dedupe lead+gatilho dentro da própria varredura

  for (const m of msgs) {
    if (!m.lead || !m.content) continue;
    const text = normalizeForMatch(m.content);

    for (const t of triggers) {
      if (t.workspace_id !== m.lead.workspace_id) continue;
      if (t.direction !== 'any' && t.direction !== 'attendant') continue;
      if (!t.phrase || !text.includes(normalizeForMatch(t.phrase))) continue;

      const hasAttribution = !!(m.lead.fbclid || m.lead.ctwa_clid || m.lead.click_time);
      if (t.rotator_id) continue; // escopo por rotador: fora do backfill, exige o click casado
      if (t.only_rotator && !hasAttribution) continue;

      const key = `${t.id}:${m.lead.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const already = await prisma.conversionFired.findFirst({
        where: { trigger_id: t.id, lead_id: m.lead.id },
      });
      if (already) continue;

      const parsed = parseMoneyBR(m.content);
      planned.push({
        trigger: t,
        leadId: m.lead.id,
        phone: m.lead.phone_number,
        when: m.timestamp,
        value: parsed != null ? parsed : t.value,
        currency: t.currency,
        hasAttribution,
      });
    }
  }

  console.log(`\na disparar: ${planned.length}`);
  console.table(
    planned.map((p) => ({
      quando: p.when.toISOString().slice(0, 16),
      phone: p.phone,
      valor: p.value,
      attr: p.hasAttribution,
    }))
  );

  if (!APPLY) {
    console.log('\ndry-run — nada enviado. Rode com --apply pra disparar.');
    return;
  }

  let ok = 0;
  for (const p of planned) {
    try {
      // conversionFired antes do envio: a unique key é o que impede o gatilho
      // vivo de disparar de novo o mesmo lead depois.
      await prisma.conversionFired.create({
        data: { trigger_id: p.trigger.id, lead_id: p.leadId },
      });
    } catch {
      continue; // corrida com o gatilho vivo — já disparou
    }
    await enqueueCapiEvent({
      leadId: p.leadId,
      eventName: p.trigger.event_name,
      platform: p.trigger.platform,
      workspaceId: p.trigger.workspace_id,
      value: p.value,
      currency: p.currency,
      eventTimeMs: p.when.getTime(),
    });
    ok++;
    console.log(`enfileirado ${p.trigger.event_name} lead=${p.leadId} valor=${p.value ?? '-'}`);
  }
  console.log(`\nenfileirados: ${ok}/${planned.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Dá tempo do worker da fila drenar antes de encerrar o processo.
    await new Promise((r) => setTimeout(r, APPLY ? 15000 : 0));
    await prisma.$disconnect();
  });

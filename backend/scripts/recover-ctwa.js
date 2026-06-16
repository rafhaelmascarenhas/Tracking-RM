/**
 * Recupera ctwa_clid de leads que perderam a atribuição durante período P2022.
 * Lê ctwa-probe.log, extrai phone+ctwaClid de cada entrada após o cutoff,
 * e atualiza leads no DB que ainda não têm ctwa_clid.
 *
 * Uso: node scripts/recover-ctwa.js
 */

const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const LOG_FILE = '/var/www/tracking-rm/backend/ctwa-probe.log';
const CUTOFF = new Date('2026-06-15T10:13:30.000Z');
const WORKSPACE_ID = 'demo-workspace';

async function main() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error('ctwa-probe.log não encontrado.');
    process.exit(1);
  }

  const content = fs.readFileSync(LOG_FILE, 'utf8');

  // Divide em blocos por separador ===== TIMESTAMP phone=XXXX =====
  const headerRegex = /={5}\s+([\d\-T:.Z]+)\s+phone=(\d+)\s+={5}/g;
  const entries = [];

  let match;
  const positions = [];
  while ((match = headerRegex.exec(content)) !== null) {
    positions.push({ index: match.index, end: match.index + match[0].length, ts: match[1], phone: match[2] });
  }

  for (let i = 0; i < positions.length; i++) {
    const { ts, phone } = positions[i];
    const bodyStart = positions[i].end;
    const bodyEnd = i + 1 < positions.length ? positions[i + 1].index : content.length;
    const body = content.slice(bodyStart, bodyEnd).trim();
    entries.push({ ts: new Date(ts), phone, body });
  }

  console.log(`Total entradas no log: ${entries.length}`);

  // Filtra apenas após o cutoff
  const after = entries.filter((e) => e.ts > CUTOFF);
  console.log(`Após cutoff (${CUTOFF.toISOString()}): ${after.length}`);

  // Extrai ctwaClid de cada entrada
  const ctwaRegex = /"ctwaClid"\s*:\s*"([^"]+)"/;
  const phoneCtwa = new Map(); // phone → ctwaClid (pega o primeiro)

  for (const entry of after) {
    const m = entry.body.match(ctwaRegex);
    if (m && !phoneCtwa.has(entry.phone)) {
      phoneCtwa.set(entry.phone, m[1]);
    }
  }

  console.log(`Phones com ctwaClid após cutoff: ${phoneCtwa.size}`);
  if (phoneCtwa.size === 0) {
    console.log('Nenhum ctwaClid a recuperar.');
    return;
  }

  const prisma = new PrismaClient();
  let updated = 0;
  let skipped = 0;

  for (const [phone, ctwaClid] of phoneCtwa) {
    const lead = await prisma.lead.findFirst({
      where: { workspace_id: WORKSPACE_ID, phone_number: phone },
      select: { id: true, ctwa_clid: true },
    });

    if (!lead) {
      console.log(`  — ${phone}: lead não existe no DB`);
      skipped++;
      continue;
    }

    if (lead.ctwa_clid) {
      console.log(`  ✓ ${phone}: já tem ctwa_clid, pulando`);
      skipped++;
      continue;
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: { ctwa_clid: ctwaClid },
    });
    console.log(`  ✓ Atualizado: ${phone} → ${ctwaClid.slice(0, 20)}…`);
    updated++;
  }

  console.log(`\nConcluído: ${updated} leads com ctwa_clid recuperado, ${skipped} ignorados.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

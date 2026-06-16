/**
 * Recupera leads perdidos durante período de P2022 (ctwa_clid coluna faltando).
 * Estratégia: encontra o último phone conhecido no log pm2, extrai todos os
 * phones únicos que apareceram DEPOIS dele, cruza com DB e cria leads faltantes.
 * Busca nome no uazapi /contacts.
 *
 * Uso: node scripts/recover-leads.js
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const LOG_FILE = '/root/.pm2/logs/tracking-rm-out.log';
const ANCHOR_PHONE = '557781683832'; // ariltondocarmo — último lead capturado antes do bug
const WORKSPACE_ID = 'demo-workspace';

const UAZAPI_URL = 'https://jgtech.uazapi.com';
const INSTANCE_TOKENS = [
  '267efcdc-b90d-405b-a086-432b6c1d49ea', // numero-alvaro
  '60b18a1c-8b6e-4253-8a2e-f22f498395f0', // numero-adler
];

async function getContactsMap() {
  const map = new Map(); // phone → name
  for (const token of INSTANCE_TOKENS) {
    try {
      const res = await fetch(`${UAZAPI_URL}/contacts`, { headers: { token } });
      if (!res.ok) continue;
      const contacts = await res.json();
      for (const c of contacts) {
        const phone = (c.jid || '').replace('@s.whatsapp.net', '').replace(/\D/g, '');
        const name = c.contact_name || c.contact_FirstName || null;
        if (phone && name) map.set(phone, name);
      }
    } catch (e) {
      console.warn('Falha ao buscar contacts do token', token, e.message);
    }
  }
  return map;
}

async function main() {
  if (!fs.existsSync(LOG_FILE)) {
    console.error('Log file não encontrado:', LOG_FILE);
    process.exit(1);
  }

  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n');

  // Acha o índice da ÚLTIMA ocorrência do phone âncora
  let anchorIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes(`phone=${ANCHOR_PHONE}`) && lines[i].includes('[webhook] IN')) {
      anchorIdx = i;
      break;
    }
  }

  if (anchorIdx === -1) {
    console.error('Phone âncora não encontrado no log. Abortando.');
    process.exit(1);
  }

  console.log(`Âncora encontrada na linha ${anchorIdx + 1}. Analisando entradas posteriores...`);

  // Extrai phones únicos após o âncora
  const phonesAfter = new Set();
  const phoneRegex = /\[webhook\] IN phone=(\d+)/;
  for (let i = anchorIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(phoneRegex);
    if (m) phonesAfter.add(m[1]);
  }

  console.log(`Phones únicos após âncora: ${phonesAfter.size}`);

  const prisma = new PrismaClient();

  // Busca leads existentes no período para não duplicar
  const existing = await prisma.lead.findMany({
    where: { workspace_id: WORKSPACE_ID },
    select: { phone_number: true },
  });
  const existingPhones = new Set(existing.map((l) => l.phone_number));

  const missing = [...phonesAfter].filter((p) => !existingPhones.has(p));
  console.log(`Leads já no DB: ${existingPhones.size}`);
  console.log(`Phones NÃO no DB (a criar): ${missing.length}`);

  if (missing.length === 0) {
    console.log('Nenhum lead faltando. Tudo OK.');
    await prisma.$disconnect();
    return;
  }

  // Busca nomes do uazapi
  console.log('Buscando nomes no uazapi...');
  const contactsMap = await getContactsMap();

  let created = 0;
  for (const phone of missing) {
    const name = contactsMap.get(phone) || null;
    try {
      await prisma.lead.create({
        data: {
          workspace_id: WORKSPACE_ID,
          phone_number: phone,
          name,
        },
      });
      console.log(`  ✓ Criado: ${phone} — ${name || '(sem nome)'}`);
      created++;
    } catch (e) {
      console.warn(`  ✗ Falhou ${phone}:`, e.message);
    }
  }

  console.log(`\nRecuperação concluída: ${created}/${missing.length} leads criados.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });

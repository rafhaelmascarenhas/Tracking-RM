// Diagnóstico do tracking pela mensagem de disparo (token do rotador).
// Rodar no VPS: node backend/scripts/diag-disparo.js
// Mostra: cliques recentes x leads recentes x se casaram. Aponta onde o funil quebra.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h

  const clicks = await prisma.rotatorClick.findMany({
    where: { created_at: { gte: since } },
    orderBy: { created_at: 'desc' },
    take: 50,
  });
  const byStatus = clicks.reduce((a, c) => ((a[c.status] = (a[c.status] || 0) + 1), a), {});
  console.log('\n=== CLIQUES 24h ===', clicks.length, JSON.stringify(byStatus));
  console.log('bots:', clicks.filter((c) => /facebookexternalhit|bot|crawler|python-requests|curl|axios/i.test(c.user_agent || '')).length);

  const leads = await prisma.lead.findMany({
    where: { created_at: { gte: since } },
    orderBy: { created_at: 'desc' },
    take: 50,
    include: { messages: { where: { direction: 'INBOUND' }, orderBy: { created_at: 'asc' }, take: 1 } },
  });
  console.log('\n=== LEADS 24h ===', leads.length);
  let attributed = 0, hasTokenInFirstMsg = 0;
  for (const l of leads) {
    const first = l.messages[0]?.content || '';
    const tok = first.match(/\[([a-f0-9]{6,10})\]/i)?.[1];
    if (tok) hasTokenInFirstMsg++;
    if (l.fbclid || l.click_time || l.utm_source || l.ctwa_clid) attributed++;
  }
  console.log('com atribuição (fbclid/click/utm/ctwa):', attributed, '/', leads.length);
  console.log('1a msg inbound tinha [token]:', hasTokenInFirstMsg, '/', leads.length);

  console.log('\n=== AMOSTRA (10 leads) ===');
  for (const l of leads.slice(0, 10)) {
    const first = l.messages[0]?.content || '(sem msg)';
    console.log(
      l.created_at.toISOString().slice(0, 16),
      'attr=' + !!(l.fbclid || l.click_time || l.utm_source || l.ctwa_clid),
      'src=' + (l.utm_source || '-'),
      '| 1a msg:', JSON.stringify(first.slice(0, 60))
    );
  }
  await prisma.$disconnect();
})();

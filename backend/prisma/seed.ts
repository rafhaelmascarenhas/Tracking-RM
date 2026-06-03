import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const META_STANDARD_EVENTS = [
  'ViewContent', 'Lead', 'Purchase', 'AddPaymentInfo', 'AddToCart',
  'AddToWishlist', 'CompleteRegistration', 'Contact', 'CustomizeProduct',
  'Donate', 'FindLocation', 'InitiateCheckout', 'Schedule', 'Search',
  'StartTrial', 'SubmitApplication', 'Subscribe',
];

async function main() {
  // Seed creates a demo workspace with default journey stages
  const workspace = await prisma.workspace.upsert({
    where: { id: 'demo-workspace' },
    update: {},
    create: {
      id: 'demo-workspace',
      name: 'Demo Workspace',
    },
  });

  const stages = [
    { name: 'Fez Contato', order_index: 0 },
    { name: 'Qualificado', order_index: 1 },
    { name: 'Proposta Enviada', order_index: 2 },
    { name: 'Comprou', order_index: 3 },
    { name: 'Abandono', order_index: 4 },
  ];

  for (const s of stages) {
    await prisma.journeyStage.upsert({
      where: { id: `${workspace.id}-stage-${s.order_index}` },
      update: {},
      create: {
        id: `${workspace.id}-stage-${s.order_index}`,
        workspace_id: workspace.id,
        name: s.name,
        order_index: s.order_index,
        system_default: true,
      },
    });
  }

  console.log('Seed complete. Meta standard events available:', META_STANDARD_EVENTS.join(', '));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

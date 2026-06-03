import { prisma } from '../lib/prisma';
import type { RotatorTarget, WhatsappConnection } from '@prisma/client';

export type TargetWithConnection = RotatorTarget & { connection: WhatsappConnection };

/**
 * Escolhe 1 número (target) de um rotador conforme o modo de distribuição.
 * Regra de ouro: só sorteia número CONNECTED. Se nenhum conectado,
 * usa fallback offline (nunca derruba o lead) e loga warning.
 */
export async function pickTarget(rotatorId: string): Promise<TargetWithConnection | null> {
  const rotator = await prisma.rotator.findUnique({
    where: { id: rotatorId },
    include: { targets: { include: { connection: true } } },
  });
  if (!rotator) return null;

  const actives = rotator.targets.filter((t) => t.active);
  let pool = actives.filter((t) => t.connection.status === 'CONNECTED');
  if (pool.length === 0) {
    console.warn(`[rotator ${rotatorId}] nenhum número CONNECTED, usando fallback offline`);
    pool = actives;
  }
  if (pool.length === 0) return null;

  if (rotator.distribution === 'FALLBACK') {
    return [...pool].sort((a, b) => a.priority - b.priority)[0];
  }

  if (rotator.distribution === 'WEIGHTED') {
    const total = pool.reduce((s, t) => s + Math.max(1, t.weight), 0);
    let n = Math.random() * total;
    for (const t of pool) {
      n -= Math.max(1, t.weight);
      if (n <= 0) return t;
    }
    return pool[0];
  }

  // ROUND_ROBIN — contador atômico
  const updated = await prisma.rotator.update({
    where: { id: rotatorId },
    data: { rr_counter: { increment: 1 } },
    select: { rr_counter: true },
  });
  return pool[(updated.rr_counter - 1) % pool.length];
}

const TOKEN_RE = /\[([a-f0-9]{6,10})\]/i;
const FALLBACK_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Liga o clique do rotador à conversa. Primário: token na mensagem.
 * Fallback: clique pendente mais recente na mesma conexão dentro da janela.
 * Marca o clique como matched e retorna os dados de atribuição (fbclid/ip/ua/time).
 */
export async function matchRotatorClick(
  connectionId: string,
  leadId: string,
  messageText: string
) {
  let click = null;

  const m = messageText.match(TOKEN_RE);
  if (m) {
    click = await prisma.rotatorClick.findFirst({
      where: { token: m[1].toLowerCase(), status: 'pending' },
    });
  }

  if (!click) {
    click = await prisma.rotatorClick.findFirst({
      where: {
        connection_id: connectionId,
        status: 'pending',
        created_at: { gte: new Date(Date.now() - FALLBACK_WINDOW_MS) },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  if (!click) return null;

  await prisma.rotatorClick.update({
    where: { id: click.id },
    data: { status: 'matched', lead_id: leadId, matched_at: new Date() },
  });

  return click;
}


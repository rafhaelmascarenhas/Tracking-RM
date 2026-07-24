import { prisma } from '../lib/prisma';
import type { GroupTarget } from '@prisma/client';

/**
 * Escolhe 1 link de grupo conforme o modo de distribuição.
 * Grupo cheio (clicks_count >= max_clicks) sai do pool automaticamente.
 * Se TODOS estiverem cheios, usa o último ativo como fallback — nunca derruba
 * o clique, mas loga warning pra alguém cadastrar grupo novo.
 */
export async function pickGroupTarget(rotatorId: string): Promise<GroupTarget | null> {
  const rotator = await prisma.groupRotator.findUnique({
    where: { id: rotatorId },
    include: { targets: true },
  });
  if (!rotator) return null;

  const actives = rotator.targets.filter((t) => t.active);
  if (actives.length === 0) return null;

  let pool = actives.filter((t) => t.max_clicks == null || t.clicks_count < t.max_clicks);
  if (pool.length === 0) {
    console.warn(`[group-rotator ${rotatorId}] todos os grupos cheios, usando fallback`);
    pool = [...actives].sort((a, b) => b.priority - a.priority);
  }

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
  const updated = await prisma.groupRotator.update({
    where: { id: rotatorId },
    data: { rr_counter: { increment: 1 } },
    select: { rr_counter: true },
  });
  return pool[(updated.rr_counter - 1) % pool.length];
}

/**
 * Normaliza o que o usuário colar: aceita o link completo, com ou sem https,
 * ou só o código do convite. Retorna null se não for um convite válido.
 */
export function normalizeInviteUrl(raw: string): string | null {
  const value = (raw || '').trim();
  if (!value) return null;
  const m = value.match(/(?:chat\.whatsapp\.com\/(?:invite\/)?)?([A-Za-z0-9]{15,30})(?:[/?#]|$)/);
  if (!m) return null;
  return `https://chat.whatsapp.com/${m[1]}`;
}

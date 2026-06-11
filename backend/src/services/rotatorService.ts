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
  let pool = rotator.distribute_offline
    ? actives
    : actives.filter((t) => t.connection.status === 'CONNECTED');
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
const FALLBACK_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h — lead pode demorar pra mandar msg após clicar

// User-agents de bots (crawler do Meta valida o link antes de aprovar o anúncio).
// Esses cliques nunca devem casar com um lead real.
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  // Só crawlers/validadores conhecidos — NÃO filtra WhatsApp/IG/FB in-app (humanos reais).
  return /facebookexternalhit|facebot|bingpreview|googlebot|crawler|spider|headlesschrome|python-requests|curl\/|wget|axios/i.test(ua);
}

/**
 * Liga o clique do rotador à conversa.
 *  - Primário: token na mensagem (preciso, sempre confiável).
 *  - Fallback: só quando a mensagem veio de clique no link (clickToChat) — clique
 *    pendente NÃO-bot mais recente na mesma conexão dentro de 30min.
 * Evita atribuir cliques de bot/anúncio a clientes orgânicos.
 */
export async function matchRotatorClick(
  connectionId: string,
  leadId: string,
  messageText: string,
  opts: { clickToChat?: boolean } = {}
) {
  let click = null;

  // 1) Token na mensagem — match exato.
  const m = messageText.match(TOKEN_RE);
  if (m) {
    click = await prisma.rotatorClick.findFirst({
      where: { token: m[1].toLowerCase(), status: 'pending' },
    });
  }

  // 2) Fallback por TEXTO DO PREFILL. O uazapi não manda click_to_chat_link, então
  // usamos o próprio texto pré-preenchido como sinal de origem: lead orgânico não
  // digita "Olá! Vim pelo anúncio...". Se a msg contém o prefill de algum rotador
  // desse número (mesmo sem o [código]), casa o clique pending mais recente.
  if (!click) {
    const lower = (messageText || '').toLowerCase();
    const targets = await prisma.rotatorTarget.findMany({
      where: { connection_id: connectionId },
      select: { rotator: { select: { prefilled_text: true } } },
    });
    const fromAd = targets.some((t) => {
      const pf = (t.rotator.prefilled_text || '').toLowerCase().trim();
      // exige um trecho distintivo do prefill (>=12 chars) presente na mensagem
      return pf.length >= 12 && lower.includes(pf.slice(0, 40));
    });
    if (fromAd) {
      const candidates = await prisma.rotatorClick.findMany({
        where: {
          connection_id: connectionId,
          status: 'pending',
          created_at: { gte: new Date(Date.now() - FALLBACK_WINDOW_MS) },
        },
        orderBy: { created_at: 'desc' },
        take: 10,
      });
      // Ignora cliques de bot (crawler do Meta).
      click = candidates.find((c) => !isBotUserAgent(c.user_agent)) ?? null;
    }
  }

  if (!click) return null;

  await prisma.rotatorClick.update({
    where: { id: click.id },
    data: { status: 'matched', lead_id: leadId, matched_at: new Date() },
  });

  return click;
}


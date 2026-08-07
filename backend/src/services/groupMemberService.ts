import { prisma } from '../lib/prisma';

/**
 * Registra entradas e saídas de grupo vindas do evento group-participants.update.
 *
 * Pré-requisito operacional: o número conectado precisa ser ADMIN do grupo, senão
 * o provider nunca recebe o evento e a contagem fica em zero sem erro nenhum.
 *
 * O vínculo com o rotador vem do group_jid gravado no GroupTarget. Se o target
 * ainda não teve o JID resolvido, o membro entra com target_id nulo — o dado da
 * entrada não se perde, só fica sem atribuição até o backfill rodar.
 */

export type ParticipantAction = 'add' | 'remove' | 'promote' | 'demote';

/**
 * O Evolution manda `participants` ora como lista de strings ("55...@s.whatsapp.net"),
 * ora como lista de objetos ({ id, admin }). Assumir string derrubava o handler
 * inteiro com "jid.replace is not a function", e o webhook respondia 500 — ou
 * seja, o evento chegava e era jogado fora.
 */
function toPhone(participant: unknown): string {
  const jid =
    typeof participant === 'string'
      ? participant
      : ((participant as any)?.id ?? (participant as any)?.jid ?? '');
  return String(jid).replace(/@.*$/, '').replace(/\D/g, '');
}

export async function recordParticipantUpdate(params: {
  workspaceId: string;
  groupJid: string;
  participants: unknown[];
  action: ParticipantAction;
}): Promise<{ added: number; removed: number }> {
  const { workspaceId, groupJid, participants, action } = params;

  // promote/demote não mexem em quem está dentro do grupo.
  if (action !== 'add' && action !== 'remove') return { added: 0, removed: 0 };

  const phones = participants.map(toPhone).filter(Boolean);
  if (phones.length === 0) return { added: 0, removed: 0 };

  const target = await prisma.groupTarget.findUnique({
    where: { group_jid: groupJid },
    select: { id: true, rotator_id: true },
  });

  if (action === 'remove') {
    const res = await prisma.groupMember.updateMany({
      where: { group_jid: groupJid, phone_number: { in: phones }, left_at: null },
      data: { left_at: new Date() },
    });
    return { added: 0, removed: res.count };
  }

  let added = 0;
  for (const phone of phones) {
    // upsert: reentrada no mesmo grupo limpa o left_at em vez de duplicar linha.
    await prisma.groupMember.upsert({
      where: { group_jid_phone_number: { group_jid: groupJid, phone_number: phone } },
      update: { left_at: null, target_id: target?.id ?? undefined, rotator_id: target?.rotator_id ?? undefined },
      create: {
        workspace_id: workspaceId,
        rotator_id: target?.rotator_id ?? null,
        target_id: target?.id ?? null,
        group_jid: groupJid,
        phone_number: phone,
      },
    });
    added++;
  }
  return { added, removed: 0 };
}

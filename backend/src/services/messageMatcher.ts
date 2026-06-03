import { prisma } from '../lib/prisma';
import { TrackableMessage } from '@prisma/client';

export async function matchTrackableMessage(
  workspaceId: string,
  messageText: string
): Promise<TrackableMessage | null> {
  const messages = await prisma.trackableMessage.findMany({
    where: { workspace_id: workspaceId },
  });

  const normalized = messageText.trim().toLowerCase();

  return (
    messages.find((m) =>
      normalized.includes(m.base_text.trim().toLowerCase())
    ) || null
  );
}

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { matchTrackableMessage } from '../services/messageMatcher';
import { matchRotatorClick } from '../services/rotatorService';

export const webhookRouter = Router();

// uazapiGO webhook format:
// { EventType, instanceName, owner, token, message: { sender, fromMe, isGroup, text/content, ... }, chat: {...} }
// Eventos: "messages" (mensagem), "messages_update" (recibos), "connection"/"status".
webhookRouter.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    // EventType é a string confiável. body.event às vezes é objeto (recibos).
    const eventType: string = typeof body.EventType === 'string'
      ? body.EventType
      : typeof body.event === 'string'
        ? body.event
        : '';

    const instanceName: string = body.instanceName || body.instance || '';

    // Evento de conexão: sincroniza status do número.
    if (eventType.toLowerCase().includes('connection') || eventType.toLowerCase() === 'status') {
      const rawState = String(
        body?.state ?? body?.status ?? body?.data?.state ?? body?.instance?.status ?? ''
      ).toLowerCase();
      const ownerPhone = String(body?.owner ?? body?.data?.owner ?? '').replace(/\D/g, '');
      const connected = ['connected', 'open'].includes(rawState) || body?.loggedIn === true;
      if (instanceName) {
        await prisma.whatsappConnection.updateMany({
          where: { session_name: instanceName },
          data: {
            status: connected ? 'CONNECTED' : rawState === 'connecting' ? 'CONNECTING' : 'DISCONNECTED',
            ...(connected && ownerPhone ? { phone_number: ownerPhone } : {}),
          },
        });
      }
      return res.json({ ok: true, handled: 'connection' });
    }

    // Só processa mensagens novas (não recibos messages_update).
    if (eventType !== 'messages') {
      return res.json({ ok: true, skipped: eventType || 'unknown' });
    }

    const msg = body.message ?? body.data?.message ?? {};

    const fromMe: boolean = msg.fromMe ?? body?.event?.IsFromMe ?? body?.data?.key?.fromMe ?? false;
    if (fromMe) return res.json({ ok: true, skipped: 'outbound' });

    const isGroup: boolean = msg.isGroup ?? body?.event?.IsGroup ?? false;
    // chatid = JID com o telefone real (@s.whatsapp.net). chatlid = id interno (@lid), não usar.
    const senderJid: string = msg.chatid || msg.chatId || msg.sender || body?.data?.key?.remoteJid || '';
    if (isGroup || senderJid.includes('@g.us')) return res.json({ ok: true, skipped: 'group' });

    const phone = senderJid.replace(/@.*$/, '').replace(/\D/g, '');

    // uazapiGO: texto em content.text (objeto). Fallbacks pra outros shapes.
    const text: string =
      (typeof msg.content === 'object' ? msg.content?.text : msg.content) ||
      msg.text ||
      msg.conversation ||
      msg.caption ||
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      '';

    const contactName: string = msg.senderName || msg.pushName || body?.chat?.lead_name || body?.chat?.name || '';

    // Marcador do WhatsApp: mensagem originada de clique em link wa.me (não conversa orgânica).
    const entryPoint: string =
      msg.content?.contextInfo?.entryPointConversionSource ||
      msg.contextInfo?.entryPointConversionSource || '';
    const isClickToChat = entryPoint === 'click_to_chat_link';

    const tokenInText = text.match(/\[([a-f0-9]{6,10})\]/i)?.[1] || '-';
    console.log(`[webhook] IN phone=${phone || '-'} inst=${instanceName || '-'} token=${tokenInText} c2c=${isClickToChat} text="${(text || '').slice(0, 40)}"`);

    if (!phone || !instanceName) {
      console.log('[webhook] SKIP sem phone/instance');
      return res.status(200).json({ ok: true, skipped: 'no phone/instance' });
    }

    const connection = await prisma.whatsappConnection.findFirst({
      where: { session_name: instanceName },
    });
    if (!connection) {
      console.log(`[webhook] SKIP connection não encontrada: inst=${instanceName}`);
      return res.status(200).json({ ok: true, skipped: 'connection not found' });
    }

    const workspaceId = connection.workspace_id;

    if (connection.status !== 'CONNECTED') {
      await prisma.whatsappConnection.update({ where: { id: connection.id }, data: { status: 'CONNECTED' } });
    }

    let lead = await prisma.lead.upsert({
      where: { workspace_id_phone_number: { workspace_id: workspaceId, phone_number: phone } },
      update: contactName ? { name: contactName } : {},
      create: { workspace_id: workspaceId, phone_number: phone, name: contactName || null },
    });

    // Atribuição UTM via mensagem rastreável (só se ainda sem UTM)
    if (text && !lead.utm_source) {
      const match = await matchTrackableMessage(workspaceId, text);
      if (match) {
        lead = await prisma.lead.update({
          where: { id: lead.id },
          data: {
            utm_source: match.utm_source,
            utm_medium: match.utm_medium,
            utm_campaign: match.utm_campaign,
            utm_term: match.utm_term,
            utm_content: match.utm_content,
          },
        });
      }
    }

    // Atribuição fina do rotador (fbclid/ip/ua) — só se ainda não casado
    if (!lead.fbclid && !lead.click_time) {
      const click = await matchRotatorClick(connection.id, lead.id, text || '', { clickToChat: isClickToChat });
      if (click) {
        lead = await prisma.lead.update({
          where: { id: lead.id },
          data: {
            fbclid: click.fbclid,
            click_ip: click.ip_address,
            click_user_agent: click.user_agent,
            click_time: click.created_at,
          },
        });
        console.log('[webhook] MATCH rotator click', { lead: lead.id, fbclid: click.fbclid });
      }
    }

    if (text) {
      await prisma.message.create({
        data: {
          lead_id: lead.id,
          direction: 'INBOUND',
          content: text.replace(/\s*\[[a-f0-9]{6,10}\]\s*$/i, '').trim() || text,
        },
      });
    }

    return res.json({ ok: true, lead_id: lead.id });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

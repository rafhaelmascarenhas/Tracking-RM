import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { matchTrackableMessage } from '../services/messageMatcher';
import { matchRotatorClick } from '../services/rotatorService';
import { evaluateTriggers } from '../services/triggerService';

export const webhookRouter = Router();

// PROBE TEMPORÁRIO — grava payload bruto completo de toda msg de lead pra mapear
// atribuição CTWA (anúncio de mensagem direta). Remover após mapear o ctwa_clid.
const CTWA_PROBE_FILE = path.join(process.cwd(), 'ctwa-probe.log');
function probeRawPayload(phone: string, body: unknown) {
  try {
    const line = `\n===== ${new Date().toISOString()} phone=${phone} =====\n${JSON.stringify(body, null, 2)}\n`;
    fs.appendFile(CTWA_PROBE_FILE, line, () => {});
  } catch { /* best-effort */ }
}

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

    // DEBUG TEMPORÁRIO — mapear atribuição CTWA do uazapi. track_id/track_source são
    // campos próprios do uazapi (prováveis portadores do ctwa_clid). Remover após mapear.
    if (!fromMe) {
      const m = msg as Record<string, any>;
      console.log('[webhook CTWA-PROBE]',
        'track_id=', JSON.stringify(m.track_id),
        'track_source=', JSON.stringify(m.track_source),
        'ctx=', JSON.stringify(m.content?.contextInfo || m.contextInfo || null));
      // Grava payload bruto COMPLETO em arquivo — captura qualquer campo CTWA que o
      // regex não preveja. Inspecionar com: grep -i 'ctwa\|referral\|source' ctwa-probe.log
      probeRawPayload(phone, body);
    }

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

    // OUTBOUND (atendente respondeu): não cria lead, só avalia gatilhos de frase do atendente.
    if (fromMe) {
      const existingLead = await prisma.lead.findUnique({
        where: { workspace_id_phone_number: { workspace_id: workspaceId, phone_number: phone } },
      });
      if (existingLead && text) {
        await evaluateTriggers({
          workspaceId,
          leadId: existingLead.id,
          text,
          direction: 'attendant',
          hasAttribution: !!(existingLead.fbclid || existingLead.click_time || existingLead.ctwa_clid),
        });
      }
      return res.json({ ok: true, handled: 'outbound' });
    }

    if (connection.status !== 'CONNECTED') {
      await prisma.whatsappConnection.update({ where: { id: connection.id }, data: { status: 'CONNECTED' } });
    }

    let lead = await prisma.lead.upsert({
      where: { workspace_id_phone_number: { workspace_id: workspaceId, phone_number: phone } },
      update: contactName ? { name: contactName } : {},
      create: { workspace_id: workspaceId, phone_number: phone, name: contactName || null },
    });

    // Atribuição CTWA — anúncio de mensagem direta (Click to WhatsApp)
    const ctxInfo: Record<string, any> =
      (typeof msg.content === 'object' ? msg.content?.contextInfo : null) ||
      msg.contextInfo || {};
    const ctwaClid: string = ctxInfo?.externalAdReply?.ctwaClid || '';
    if (ctwaClid && !lead.ctwa_clid) {
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: { ctwa_clid: ctwaClid },
      });
      console.log('[webhook] CTWA attribution', { lead: lead.id, ctwaClid: ctwaClid.slice(0, 20) + '…' });
    }

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
            // Clique do rotador tem UTMs específicos do Meta (campanha/conjunto/anúncio).
            // Sempre usa click como fonte primária; fallback pro que o lead já tinha.
            utm_source: click.utm_source || lead.utm_source,
            utm_medium: click.utm_medium || lead.utm_medium,
            utm_campaign: click.utm_campaign || lead.utm_campaign,
            utm_term: click.utm_term || lead.utm_term,
            utm_content: click.utm_content || lead.utm_content,
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

    // Gatilhos do lead (conversation_open dispara mesmo sem texto; phrase precisa do texto)
    await evaluateTriggers({
      workspaceId,
      leadId: lead.id,
      text: text || '',
      direction: 'lead',
      hasAttribution: !!(lead.fbclid || lead.click_time || lead.ctwa_clid),
    });

    return res.json({ ok: true, lead_id: lead.id });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

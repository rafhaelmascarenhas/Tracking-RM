import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { matchTrackableMessage } from '../services/messageMatcher';
import { matchRotatorClick } from '../services/rotatorService';

export const webhookRouter = Router();

// uazapi webhook format:
// { event, instance, data: { key: { remoteJid, fromMe }, message: { conversation }, pushName } }
webhookRouter.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // DEBUG: loga todo payload recebido (remover após confirmar shape do uazapiGO)
    console.log('[webhook] IN', JSON.stringify(body).slice(0, 800));

    // Only process inbound messages
    const event: string = body?.event || '';

    // Eventos de conexão: mantém o status do número sincronizado (CONNECTED/DISCONNECTED).
    if (event.includes('connection')) {
      const instanceName: string = body?.instance || '';
      const rawState = String(
        body?.data?.state ?? body?.data?.status ?? body?.data?.connection ?? ''
      ).toLowerCase();
      const ownerPhone = String(body?.data?.owner ?? body?.data?.wid ?? '').replace(/\D/g, '');
      const connected = rawState === 'connected' || rawState === 'open' || body?.data?.loggedIn === true;
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

    if (!event.includes('messages')) {
      return res.json({ ok: true, skipped: true });
    }

    const fromMe: boolean = body?.data?.key?.fromMe ?? false;
    if (fromMe) return res.json({ ok: true, skipped: 'outbound' });

    const remoteJid: string = body?.data?.key?.remoteJid || '';
    // Skip group messages
    if (remoteJid.includes('@g.us')) return res.json({ ok: true, skipped: 'group' });

    const phone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');

    const text: string =
      body?.data?.message?.conversation ||
      body?.data?.message?.extendedTextMessage?.text ||
      body?.data?.message?.imageMessage?.caption ||
      '';

    const contactName: string = body?.data?.pushName || '';
    const sessionName: string = body?.instance || '';

    if (!phone || !sessionName) {
      return res.status(400).json({ error: 'Missing phone or session' });
    }

    // Find workspace via WhatsApp connection
    const connection = await prisma.whatsappConnection.findFirst({
      where: { session_name: sessionName },
    });

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const workspaceId = connection.workspace_id;

    // Recebeu mensagem = instância está viva. Marca CONNECTED se ainda não estava.
    if (connection.status !== 'CONNECTED') {
      await prisma.whatsappConnection.update({
        where: { id: connection.id },
        data: { status: 'CONNECTED' },
      });
    }

    // Upsert lead — update name if first time seeing it
    let lead = await prisma.lead.upsert({
      where: { workspace_id_phone_number: { workspace_id: workspaceId, phone_number: phone } },
      update: contactName ? { name: contactName } : {},
      create: { workspace_id: workspaceId, phone_number: phone, name: contactName || null },
    });

    // Match trackable message for UTM attribution (only if lead has no UTMs yet)
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

    // Match rotator click for fine attribution (fbclid/ip/ua) — só se ainda não casado
    if (text && !lead.fbclid && !lead.click_time) {
      const click = await matchRotatorClick(connection.id, lead.id, text);
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
      }
    }

    // Save message (remove o token do rotador do texto exibido)
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

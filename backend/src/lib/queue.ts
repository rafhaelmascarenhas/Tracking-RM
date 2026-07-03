import { fireMetaCapi } from '../services/metaCapi';
import { prisma } from './prisma';

type CapiJobData = {
  leadId: string;
  eventName: string;
  platform: string;
  workspaceId: string;
  value?: number | null;
  currency?: string | null;
  journeyStageId?: string | null;
  eventTimeMs?: number | null;
};

async function processCapiJob(data: CapiJobData) {
  if (data.platform !== 'META') return;

  const workspace = await prisma.workspace.findUnique({ where: { id: data.workspaceId } });
  if (!workspace?.meta_capi_token || !workspace?.meta_pixel_id) return;

  const lead = await prisma.lead.findUnique({ where: { id: data.leadId } });
  if (!lead) return;

  let status = 'error';
  let sentEvent = data.eventName;
  let actionSource: string | null = null;
  let response = '';
  try {
    const r = await fireMetaCapi({
      pixelId: workspace.meta_pixel_id,
      token: workspace.meta_capi_token,
      eventName: data.eventName,
      phone: lead.phone_number,
      utms: { source: lead.utm_source, medium: lead.utm_medium, campaign: lead.utm_campaign },
      fbclid: lead.fbclid,
      ctwaClid: lead.ctwa_clid,
      pageId: workspace.meta_page_id,
      wabaId: workspace.meta_waba_id,
      clientIp: lead.click_ip,
      userAgent: lead.click_user_agent,
      clickTimeMs: lead.click_time ? lead.click_time.getTime() : null,
      value: data.value,
      currency: data.currency,
      eventTimeMs: data.eventTimeMs,
      // dedupe se o site disparar o mesmo evento (1 evento = 1 significado)
      eventId: `${lead.id}:${data.eventName}`,
    });
    status = r.ok ? 'success' : 'error';
    sentEvent = r.sentEvent;
    actionSource = r.actionSource;
    response = r.response;
  } catch (e: any) {
    response = String(e?.message || e).slice(0, 500); // erro de rede
  }

  // Log do disparo (alimenta a tela "Disparos de Pixel"). Best-effort.
  await prisma.pixelFire.create({
    data: {
      workspace_id: data.workspaceId,
      lead_id: data.leadId,
      journey_stage_id: data.journeyStageId ?? null,
      platform: 'META',
      event_name: sentEvent,
      action_source: actionSource,
      value: data.value ?? null,
      currency: data.currency ?? null,
      status,
      response,
    },
  }).catch((e) => console.error('[pixelFire log]', e?.message));
}

// In dev (no Redis): fire inline. In prod: use BullMQ queue.
let _queue: import('bullmq').Queue | null = null;

async function getQueue() {
  if (!process.env.REDIS_URL) return null;
  if (_queue) return _queue;
  const { Queue, Worker } = await import('bullmq');
  const IORedis = (await import('ioredis')).default;
  const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  _queue = new Queue('capi-events', { connection });
  new Worker('capi-events', async (job) => processCapiJob(job.data), { connection });
  return _queue;
}

export async function enqueueCapiEvent(data: CapiJobData) {
  const queue = await getQueue();
  if (queue) {
    await queue.add('fire-capi', data);
  } else {
    // No Redis — fire inline (dev only)
    processCapiJob(data).catch((e) => console.error('CAPI inline error:', e));
  }
}

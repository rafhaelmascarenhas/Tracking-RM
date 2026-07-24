import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { pickGroupTarget } from '../services/groupRotatorService';
import { isBotUserAgent } from '../services/rotatorService';
import { landingHtml } from './rotatorRedirect';
import { firePageViewCapi } from '../services/metaCapi';

export const groupRedirectRouter = Router();

async function handleGroupRotator(
  req: Request,
  res: Response,
  short_code: string,
  forceLanding: boolean
) {
  const rotator = await prisma.groupRotator.findUnique({ where: { short_code } });
  if (!rotator || !rotator.active) return res.status(404).send('Link não encontrado');

  const workspace = await prisma.workspace.findUnique({
    where: { id: rotator.workspace_id },
    select: { meta_pixel_id: true, meta_capi_token: true, gtm_id: true },
  });

  // Pixel do rotador tem prioridade sobre o do workspace.
  const pixelId = rotator.meta_pixel_id || workspace?.meta_pixel_id || null;
  const capiToken = rotator.meta_capi_token || workspace?.meta_capi_token || null;
  const gtmId = rotator.gtm_id || workspace?.gtm_id || null;

  const target = await pickGroupTarget(rotator.id);
  if (!target) return res.status(503).send('Nenhum grupo disponível');

  const ua = req.headers['user-agent'] || null;
  const isBot = isBotUserAgent(ua);
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || null;

  // Não registra clique de bot (crawler do Meta valida o link) — mantém contador limpo.
  if (!isBot) {
    const q = req.query as Record<string, string | undefined>;
    await prisma.groupClick.create({
      data: {
        rotator_id: rotator.id,
        target_id: target.id,
        fbclid: q.fbclid || null,
        gclid: q.gclid || null,
        utm_source: q.utm_source || rotator.utm_source || null,
        utm_medium: q.utm_medium || rotator.utm_medium || null,
        utm_campaign: q.utm_campaign || rotator.utm_campaign || null,
        utm_term: q.utm_term || rotator.utm_term || null,
        utm_content: q.utm_content || rotator.utm_content || null,
        ip_address: clientIp,
        user_agent: ua,
      },
    });
    // clicks_count alimenta o corte por max_clicks (grupo lotado sai do pool).
    await prisma.groupTarget.update({
      where: { id: target.id },
      data: { clicks_count: { increment: 1 } },
    });
  }

  const useLanding = forceLanding || rotator.use_landing;

  if (useLanding) {
    if (!isBot && pixelId && capiToken) {
      firePageViewCapi({
        pixelId,
        token: capiToken,
        fbclid: (req.query.fbclid as string) || null,
        clientIp,
        userAgent: ua,
        eventId: `glp:${crypto.randomBytes(6).toString('hex')}`,
      }).catch((e) => console.warn('[CAPI PageView grupo]', e.message));
    }

    return res.send(
      landingHtml(target.invite_url, {
        logo: rotator.landing_logo,
        title: rotator.landing_title || 'Entre no nosso grupo',
        cta: rotator.landing_cta || '👥 Entrar no grupo',
        autoRedirect: !rotator.use_landing,
        seconds: rotator.redirect_seconds,
        pixelId,
        gtmId,
      })
    );
  }

  return res.redirect(302, target.invite_url);
}

// /g/chat/:short_code — sempre landing page (link pra Meta Ads)
groupRedirectRouter.get('/chat/:short_code', (req, res) =>
  handleGroupRotator(req, res, req.params.short_code, true)
);

// /g/:short_code — usa configuração do rotador (landing ou redirect direto)
groupRedirectRouter.get('/:short_code', (req, res) =>
  handleGroupRotator(req, res, req.params.short_code, false)
);

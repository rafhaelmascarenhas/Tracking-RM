import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { pickTarget, isBotUserAgent } from '../services/rotatorService';
import { firePageViewCapi } from '../services/metaCapi';

export const rotatorRedirectRouter = Router();

async function uniqueToken(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const token = crypto.randomBytes(3).toString('hex');
    const clash = await prisma.rotatorClick.findUnique({ where: { token } });
    if (!clash) return token;
  }
  return crypto.randomBytes(5).toString('hex');
}

function buildWaUrl(phone: string, prefilled: string, token: string, hideToken: boolean): string {
  const msg = hideToken ? prefilled : `${prefilled} [${token}]`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

function landingHtml(waUrl: string, opts: {
  logo?: string | null;
  title?: string | null;
  cta?: string | null;
  autoRedirect?: boolean;
  pixelId?: string | null;
  gtmId?: string | null;
}): string {
  const title = opts.title || 'Fale com a gente';
  const cta = opts.cta || '💬 Abrir WhatsApp';
  const auto = opts.autoRedirect !== false;
  const SECONDS = 3;

  const gtmHead = opts.gtmId ? `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${opts.gtmId}');</script>` : '';
  const gtmBody = opts.gtmId ? `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${opts.gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>` : '';
  const pixelScript = opts.pixelId ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${opts.pixelId}');fbq('track','ViewContent');</script><noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${opts.pixelId}&ev=ViewContent&noscript=1"/></noscript>` : '';

  const logoHtml = opts.logo
    ? `<img src="${opts.logo}" alt="Logo" class="logo-img">`
    : `<div class="logo-icon"><svg viewBox="0 0 24 24" fill="#fff" width="36" height="36"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.553 4.116 1.522 5.847L.057 23.882l6.198-1.625A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.877 9.877 0 01-5.031-1.376l-.361-.214-3.68.965.981-3.595-.235-.369A9.861 9.861 0 012.106 12C2.106 6.58 6.58 2.106 12 2.106c5.421 0 9.894 4.474 9.894 9.894 0 5.421-4.473 9.894-9.894 9.894z"/></svg></div>`;

  const autoScript = auto ? `
<script>
var n=${SECONDS},el=document.getElementById('cd');
var t=setInterval(function(){n--;el.textContent=n;if(n<=0){clearInterval(t);location.href=${JSON.stringify(waUrl)};}},1000);
</script>` : '';

  const countdownHtml = auto
    ? `<p class="sub">Você será redirecionado em <strong><span id="cd">${SECONDS}</span>s</strong>…</p>`
    : `<p class="sub">Clique no botão para iniciar seu atendimento.</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
${gtmHead}
${pixelScript}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f9fafb;font-family:system-ui,-apple-system,sans-serif}
.wrap{text-align:center;padding:2.5rem 1.5rem;max-width:380px;width:100%}
.logo-icon{width:72px;height:72px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;box-shadow:0 8px 24px rgba(37,211,102,.3)}
.logo-img{max-width:120px;max-height:80px;object-fit:contain;margin:0 auto 1.5rem;display:block}
h1{font-size:1.5rem;font-weight:700;color:#111;margin-bottom:.5rem}
.sub{font-size:.9rem;color:#6b7280;margin-bottom:1.75rem;line-height:1.6}
a{display:inline-flex;align-items:center;gap:.6rem;background:#25D366;color:#fff;text-decoration:none;font-weight:600;font-size:1.05rem;padding:1rem 2.5rem;border-radius:100px;box-shadow:0 4px 20px rgba(37,211,102,.4);transition:transform .1s}
a:active{transform:scale(.97)}
</style>
</head>
<body>
${gtmBody}
<div class="wrap">
  ${logoHtml}
  <h1>${title}</h1>
  ${countdownHtml}
  <a href="${waUrl}">${cta}</a>
</div>
${autoScript}
</body>
</html>`;
}

async function handleRotator(req: Request, res: Response, short_code: string, forceLanding: boolean) {
  const rotator = await prisma.rotator.findUnique({ where: { short_code } });
  if (!rotator || !rotator.active) return res.status(404).send('Link não encontrado');

  const workspace = await prisma.workspace.findUnique({
    where: { id: rotator.workspace_id },
    select: { meta_pixel_id: true, meta_capi_token: true, gtm_id: true },
  });

  const target = await pickTarget(rotator.id);
  if (!target) return res.status(503).send('Nenhum número disponível');

  const ua = req.headers['user-agent'] || null;
  const isBot = isBotUserAgent(ua);

  const token = await uniqueToken();
  // Não registra clique de bot (crawler do Meta valida o link) — mantém pool e contador limpos.
  if (!isBot) {
    await prisma.rotatorClick.create({
      data: {
        rotator_id: rotator.id,
        connection_id: target.connection_id,
        token,
        fbclid: (req.query.fbclid as string) || null,
        gclid: (req.query.gclid as string) || null,
        ip_address: (req.headers['x-forwarded-for'] as string) || req.ip || null,
        user_agent: ua,
      },
    });
  }

  const phone = (target.connection.phone_number || '').replace(/\D/g, '');
  if (!phone) return res.status(503).send('Número sem telefone cadastrado');

  const waUrl = buildWaUrl(phone, rotator.prefilled_text, token, rotator.hide_token);
  const useLanding = forceLanding || rotator.use_landing;

  if (useLanding) {
    // Dispara CAPI ViewContent server-side (best-effort, não bloqueia resposta) — nunca pra bot
    if (!isBot && workspace?.meta_pixel_id && workspace?.meta_capi_token) {
      firePageViewCapi({
        pixelId: workspace.meta_pixel_id,
        token: workspace.meta_capi_token,
        fbclid: (req.query.fbclid as string) || null,
        clientIp: (req.headers['x-forwarded-for'] as string) || req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        eventId: `lp:${token}`,
      }).catch((e) => console.warn('[CAPI PageView]', e.message));
    }

    // use_landing=true → usuário clica; use_landing=false + forceLanding → auto-redirect com countdown
    return res.send(landingHtml(waUrl, {
      logo: rotator.landing_logo,
      title: rotator.landing_title,
      cta: rotator.landing_cta,
      autoRedirect: !rotator.use_landing,
      pixelId: workspace?.meta_pixel_id,
      gtmId: workspace?.gtm_id,
    }));
  }

  return res.redirect(302, waUrl);
}

// /j/chat/:short_code — sempre landing page (link pra Meta Ads)
rotatorRedirectRouter.get('/chat/:short_code', (req, res) =>
  handleRotator(req, res, req.params.short_code, true)
);

// /j/:short_code — usa configuração do rotador (landing ou redirect direto)
rotatorRedirectRouter.get('/:short_code', (req, res) =>
  handleRotator(req, res, req.params.short_code, false)
);

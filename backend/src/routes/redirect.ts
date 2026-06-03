import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const redirectRouter = Router();

// Short link redirect: GET /r/:short_code
redirectRouter.get('/:short_code', async (req: Request, res: Response) => {
  const link = await prisma.trackableLink.findUnique({
    where: { short_code: req.params.short_code },
  });

  if (!link) return res.status(404).send('Link not found');

  const url = new URL(link.destination_url);
  if (link.utm_source) url.searchParams.set('utm_source', link.utm_source);
  if (link.utm_medium) url.searchParams.set('utm_medium', link.utm_medium);
  if (link.utm_campaign) url.searchParams.set('utm_campaign', link.utm_campaign);
  if (link.utm_term) url.searchParams.set('utm_term', link.utm_term);
  if (link.utm_content) url.searchParams.set('utm_content', link.utm_content);

  res.redirect(302, url.toString());
});

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { pickTarget } from '../services/rotatorService';

export const rotatorRedirectRouter = Router();

async function uniqueToken(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const token = crypto.randomBytes(3).toString('hex'); // 6 chars
    const clash = await prisma.rotatorClick.findUnique({ where: { token } });
    if (!clash) return token;
  }
  return crypto.randomBytes(5).toString('hex');
}

// Destino do anúncio: GET /j/:short_code
// Sorteia um número conectado, registra o clique e redireciona pro wa.me.
rotatorRedirectRouter.get('/:short_code', async (req: Request, res: Response) => {
  const rotator = await prisma.rotator.findUnique({
    where: { short_code: req.params.short_code },
  });
  if (!rotator || !rotator.active) return res.status(404).send('Rotator not found');

  const target = await pickTarget(rotator.id);
  if (!target) return res.status(503).send('No number available');

  // Token único por clique — amarra o clique à conversa quando a mensagem chega
  const token = await uniqueToken();

  await prisma.rotatorClick.create({
    data: {
      rotator_id: rotator.id,
      connection_id: target.connection_id,
      token,
      fbclid: (req.query.fbclid as string) || null,
      gclid: (req.query.gclid as string) || null,
      ip_address: (req.headers['x-forwarded-for'] as string) || req.ip || null,
      user_agent: req.headers['user-agent'] || null,
    },
  });

  const phone = (target.connection.phone_number || '').replace(/\D/g, '');
  if (!phone) return res.status(503).send('Number has no phone');

  // prefilled_text (casa UTMs via TrackableMessage) + token (casa o clique p/ fbclid)
  const text = encodeURIComponent(`${rotator.prefilled_text} [${token}]`);
  return res.redirect(302, `https://wa.me/${phone}?text=${text}`);
});

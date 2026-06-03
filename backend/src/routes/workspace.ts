import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const workspaceRouter = Router();

workspaceRouter.get('/', async (req: Request, res: Response) => {
  let ws = await prisma.workspace.findUnique({ where: { id: req.workspaceId! } });
  if (!ws) {
    ws = await prisma.workspace.create({
      data: { id: req.workspaceId!, name: 'Demo Workspace' },
    });
  }
  res.json(ws);
});

workspaceRouter.put('/', async (req: Request, res: Response) => {
  const { name, meta_pixel_id, meta_capi_token, google_ads_id, webhook_url, uazapi_url, uazapi_admin_token } = req.body;
  const ws = await prisma.workspace.upsert({
    where: { id: req.workspaceId! },
    update: { name, meta_pixel_id, meta_capi_token, google_ads_id, webhook_url, uazapi_url, uazapi_admin_token },
    create: {
      id: req.workspaceId!,
      name: name || 'Demo Workspace',
      meta_pixel_id, meta_capi_token, google_ads_id, webhook_url, uazapi_url, uazapi_admin_token,
    },
  });
  res.json(ws);
});

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
  const { name, meta_pixel_id, meta_capi_token, meta_page_id, meta_waba_id, google_ads_id, gtm_id, webhook_url, uazapi_url, uazapi_admin_token, evolution_url, evolution_api_key } = req.body;
  const ws = await prisma.workspace.upsert({
    where: { id: req.workspaceId! },
    update: { name, meta_pixel_id, meta_capi_token, meta_page_id, meta_waba_id, google_ads_id, gtm_id, webhook_url, uazapi_url, uazapi_admin_token, evolution_url, evolution_api_key },
    create: {
      id: req.workspaceId!,
      name: name || 'Demo Workspace',
      meta_pixel_id, meta_capi_token, meta_page_id, meta_waba_id, google_ads_id, gtm_id, webhook_url, uazapi_url, uazapi_admin_token, evolution_url, evolution_api_key,
    },
  });
  res.json(ws);
});

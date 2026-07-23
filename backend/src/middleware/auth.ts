import { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';
import {
  PANEL_JWT_SECRET,
  PANEL_WORKSPACE_ID,
  authEnabled,
  authMisconfigured,
} from '../lib/panelAuth';

declare global {
  namespace Express {
    interface Request {
      workspaceId?: string;
      userId?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Config quebrada (senha setada, segredo do JWT faltando) barra tudo em vez de
  // cair no caminho aberto.
  if (authMisconfigured()) {
    return res.status(503).json({ error: 'Auth mal configurada no servidor' });
  }

  // Sem PANEL_PASSWORD a auth fica desligada: dev local roda sem login. Antes
  // isso dependia de NODE_ENV, e a VPS rodando com NODE_ENV=development deixou
  // a API inteira aberta em producao sem ninguem notar.
  if (!authEnabled()) {
    req.userId = 'dev-user';
    req.workspaceId = PANEL_WORKSPACE_ID;
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  try {
    const { payload } = await jwtVerify(token, PANEL_JWT_SECRET());
    req.userId = payload.sub;
    req.workspaceId = (payload as any).workspace_id || PANEL_WORKSPACE_ID;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

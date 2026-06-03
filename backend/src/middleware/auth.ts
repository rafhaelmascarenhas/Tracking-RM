import { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet } from 'jose';

declare global {
  namespace Express {
    interface Request {
      workspaceId?: string;
      userId?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // DEV MODE: bypass auth, inject demo workspace
  if (process.env.NODE_ENV !== 'production') {
    req.userId = 'dev-user';
    req.workspaceId = 'demo-workspace';
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  try {
    const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    req.userId = payload.sub;
    req.workspaceId = (payload as any).workspace_id || (payload as any).user_metadata?.workspace_id;

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

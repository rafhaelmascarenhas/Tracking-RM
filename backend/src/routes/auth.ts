import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { SignJWT } from 'jose';
import { PANEL_JWT_SECRET, PANEL_PASSWORD, PANEL_WORKSPACE_ID, authEnabled } from '../lib/panelAuth';

export const authRouter = Router();

// Comparacao em tempo constante pra senha nao vazar por timing. Compara sempre
// buffers do mesmo tamanho, senao timingSafeEqual joga excecao e o length da
// senha vaza pelo erro.
function passwordMatches(sent: string, expected: string) {
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

// Painel single-tenant: uma senha compartilhada troca por um JWT de 30 dias.
authRouter.post('/login', async (req, res) => {
  if (!authEnabled()) {
    return res.status(503).json({ error: 'Auth nao configurada no servidor' });
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || !passwordMatches(password, PANEL_PASSWORD())) {
    return res.status(401).json({ error: 'Senha invalida' });
  }

  const token = await new SignJWT({ workspace_id: PANEL_WORKSPACE_ID })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('panel-user')
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(PANEL_JWT_SECRET());

  res.json({ token });
});

// O front usa isso pra saber se precisa pedir senha (deploy sem PANEL_PASSWORD
// continua entrando direto, como era antes).
authRouter.get('/config', (_req, res) => {
  res.json({ auth_required: authEnabled() });
});

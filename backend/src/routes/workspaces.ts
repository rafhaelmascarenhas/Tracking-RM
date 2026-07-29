import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { SignJWT } from 'jose';
import { prisma } from '../lib/prisma';
import { PANEL_JWT_SECRET, authEnabled } from '../lib/panelAuth';

/**
 * Troca de cliente no painel.
 *
 * O painel é operado por uma pessoa só (senha única), então não há tabela de
 * usuário: o "login" continua sendo a senha, e trocar de cliente é reassinar o
 * JWT com outro workspace_id. Todo o isolamento já existe — cada rota filtra
 * por req.workspaceId, que sai do token.
 *
 * Consequência assumida: quem tem a senha alcança todos os workspaces. Isso é
 * aceitável enquanto só o operador logar. No dia em que o cliente logar, isso
 * vira tabela User com workspace fixo por pessoa.
 */
export const workspacesRouter = Router();

// Lista os clientes com um resumo pra dar noção de tamanho na hora de trocar.
workspacesRouter.get('/', async (_req: Request, res: Response) => {
  const items = await prisma.workspace.findMany({
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      name: true,
      created_at: true,
      _count: { select: { leads: true, whatsappConnections: true } },
    },
  });
  res.json(items);
});

workspacesRouter.post('/', async (req: Request, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });

  const ws = await prisma.workspace.create({
    data: { id: crypto.randomUUID(), name },
    select: { id: true, name: true },
  });
  res.status(201).json(ws);
});

workspacesRouter.put('/:id', async (req: Request, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });

  const ws = await prisma.workspace
    .update({ where: { id: req.params.id }, data: { name }, select: { id: true, name: true } })
    .catch(() => null);
  if (!ws) return res.status(404).json({ error: 'Not found' });
  res.json(ws);
});

/**
 * Emite um token novo apontando pro workspace escolhido.
 *
 * Fica sob authMiddleware de propósito: só quem já tem token válido troca de
 * cliente. Se estivesse junto do /auth/login (rota pública), viraria um jeito
 * de obter token sem senha nenhuma.
 */
workspacesRouter.post('/:id/switch', async (req: Request, res: Response) => {
  if (!authEnabled()) {
    return res.status(400).json({
      error: 'Auth desligada neste servidor (sem PANEL_PASSWORD): o workspace vem fixo da env e não há token pra reassinar.',
    });
  }

  const ws = await prisma.workspace.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true },
  });
  if (!ws) return res.status(404).json({ error: 'Cliente não encontrado' });

  const token = await new SignJWT({ workspace_id: ws.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(req.userId || 'panel-user')
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(PANEL_JWT_SECRET());

  res.json({ token, workspace: ws });
});

/**
 * Apagar cliente derruba leads, números, rotadores e disparos em cascata.
 * Exige o nome exato no corpo — confirmar com "sim" é fácil demais de fazer no
 * cliente errado, e não há undo.
 */
workspacesRouter.delete('/:id', async (req: Request, res: Response) => {
  const ws = await prisma.workspace.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, _count: { select: { leads: true } } },
  });
  if (!ws) return res.status(404).json({ error: 'Not found' });

  if (req.body?.confirm_name !== ws.name) {
    return res.status(400).json({
      error: `Digite o nome exato do cliente ("${ws.name}") pra confirmar. Isso apaga ${ws._count.leads} lead(s) e não tem volta.`,
    });
  }
  if (ws.id === req.workspaceId) {
    return res.status(400).json({ error: 'Troque pra outro cliente antes de apagar este.' });
  }

  await prisma.workspace.delete({ where: { id: ws.id } });
  res.json({ ok: true });
});

// Auth do painel: senha unica compartilhada trocada por um JWT.
//
// Lido em runtime (nao no import) porque o pm2 injeta env depois do bundle
// carregar em alguns restarts, e um modulo cacheado com valor vazio deixaria a
// auth desligada sem ninguem perceber.

export const PANEL_WORKSPACE_ID = process.env.PANEL_WORKSPACE_ID || 'demo-workspace';

export function PANEL_PASSWORD() {
  return process.env.PANEL_PASSWORD || '';
}

// Logins nomeados alem da senha compartilhada, todos com o mesmo acesso.
// Formato: PANEL_USERS="usuario:senha,outro:senha2" (senha pode ter ':').
export function PANEL_USERS(): Map<string, string> {
  const users = new Map<string, string>();
  for (const entry of (process.env.PANEL_USERS || '').split(',')) {
    const i = entry.indexOf(':');
    if (i <= 0) continue;
    const user = entry.slice(0, i).trim().toLowerCase();
    const pass = entry.slice(i + 1).trim();
    if (user && pass) users.set(user, pass);
  }
  return users;
}

export function PANEL_JWT_SECRET() {
  return new TextEncoder().encode(process.env.PANEL_JWT_SECRET || '');
}

// Sem PANEL_PASSWORD nem PANEL_USERS a auth fica desligada (dev local segue sem
// atrito). Se ha credencial mas falta o segredo do JWT, e erro de config: melhor
// barrar tudo do que assinar token com segredo vazio.
export function authEnabled() {
  return PANEL_PASSWORD().length > 0 || PANEL_USERS().size > 0;
}

export function authMisconfigured() {
  return authEnabled() && !process.env.PANEL_JWT_SECRET;
}

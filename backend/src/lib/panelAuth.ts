// Auth do painel: senha unica compartilhada trocada por um JWT.
//
// Lido em runtime (nao no import) porque o pm2 injeta env depois do bundle
// carregar em alguns restarts, e um modulo cacheado com valor vazio deixaria a
// auth desligada sem ninguem perceber.

export const PANEL_WORKSPACE_ID = process.env.PANEL_WORKSPACE_ID || 'demo-workspace';

export function PANEL_PASSWORD() {
  return process.env.PANEL_PASSWORD || '';
}

export function PANEL_JWT_SECRET() {
  return new TextEncoder().encode(process.env.PANEL_JWT_SECRET || '');
}

// Sem PANEL_PASSWORD a auth fica desligada (dev local segue sem atrito). Se a
// senha existe mas falta o segredo do JWT, e erro de config: melhor barrar tudo
// do que assinar token com segredo vazio.
export function authEnabled() {
  return PANEL_PASSWORD().length > 0;
}

export function authMisconfigured() {
  return authEnabled() && !process.env.PANEL_JWT_SECRET;
}

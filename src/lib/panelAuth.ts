import { API_BASE } from './apiBase';

// Auth do painel: senha unica trocada por um JWT que fica no localStorage.
const TOKEN_KEY = 'panel_token';

export function getPanelToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setPanelToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage bloqueado (aba anonima): segue sem persistir */
  }
}

export function clearPanelToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* idem */
  }
}

export async function fetchAuthConfig(): Promise<{ auth_required: boolean }> {
  const res = await fetch(`${API_BASE}/api/auth/config`);
  if (!res.ok) throw new Error(`auth/config falhou: ${res.status}`);
  return res.json();
}

export async function loginWithPassword(password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (res.status === 401) throw new Error('Senha invalida');
  if (!res.ok) throw new Error(`Login falhou: ${res.status}`);

  const { token } = await res.json();
  setPanelToken(token);
  return token as string;
}

// Token expirado/invalido: limpa e volta pro login em vez de deixar a tela
// presa num erro que so um F5 manual resolveria.
export function onUnauthorized() {
  clearPanelToken();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

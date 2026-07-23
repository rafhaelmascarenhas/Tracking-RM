// Base do backend. Em prod o painel fala com a mesma origem: o vercel.json faz
// rewrite de /api e /j pro backend da VPS.
//
// VITE_API_URL só vale em dev ou se apontar pra um host publico. Se vier vazia,
// apontando pra localhost ou pra um IP privado num build de producao, ignoramos:
// ja derrubou o painel uma vez (env de dev vazada pro build da Vercel).
function resolveApiBase(): string {
  const configured = (import.meta.env.VITE_API_URL ?? '').trim();

  if (!import.meta.env.PROD) return configured || 'http://localhost:3001';
  if (!configured) return '';

  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(configured)
    ? ''
    : configured;
}

export const API_BASE = resolveApiBase();

// Origem absoluta pras URLs que a gente mostra pro usuario copiar (link de
// rotador, webhook da uazapi). API_BASE vazia = mesma origem do painel.
export const PUBLIC_ORIGIN =
  API_BASE || (typeof window !== 'undefined' ? window.location.origin : '');


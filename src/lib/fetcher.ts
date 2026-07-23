import { API_BASE as API_URL } from './apiBase';
import { getPanelToken, onUnauthorized } from './panelAuth';
import { supabase } from './supabase';

async function getToken() {
  // Supabase, quando configurado, tem precedencia; senao vale o token da senha
  // unica do painel.
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  }
  return getPanelToken();
}

async function request(method: string, path: string, body?: any) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    onUnauthorized();
    throw new Error('Sessao expirada, faca login de novo');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Baixa um arquivo (ex: CSV) do backend com auth e dispara o download no browser.
export async function downloadFile(path: string, filename: string) {
  const token = await getToken();
  const res = await fetch(`${API_URL}/api${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Download ${path} failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const fetcher = (path: string) => request('GET', path);
export const poster = (path: string, body?: any) => request('POST', path, body);
export const patcher = (path: string, body?: any) => request('PATCH', path, body);
export const putter = (path: string, body?: any) => request('PUT', path, body);
export const deleter = (path: string) => request('DELETE', path);

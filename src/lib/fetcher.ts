import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function getToken() {
  if (!supabase) return '';
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} failed: ${res.status} ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const fetcher = (path: string) => request('GET', path);
export const poster = (path: string, body?: any) => request('POST', path, body);
export const patcher = (path: string, body?: any) => request('PATCH', path, body);
export const putter = (path: string, body?: any) => request('PUT', path, body);
export const deleter = (path: string) => request('DELETE', path);

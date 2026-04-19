// All API calls go through /api — proxied to localhost:8000 by Vite in dev,
// handled by Nginx in production.
export const BASE = '/api';

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    credentials: 'include', // send httpOnly auth cookie on every request
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    body: formData,
    credentials: 'include', // send httpOnly auth cookie
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((body as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

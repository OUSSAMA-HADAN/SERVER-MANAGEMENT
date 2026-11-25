// Small fetch wrapper: JSON in/out, readable errors, and session-expiry detection.
export const SERVER_NAME = import.meta.env.VITE_SERVER_NAME || 'server';
export const APP_TITLE = import.meta.env.VITE_APP_TITLE || 'ServerCtrl';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

let checkingAuth = null;
/** Protected endpoints answer 404 (stealth) or 401 once the login is gone — confirm and broadcast. */
function maybeExpired() {
  if (!checkingAuth) {
    checkingAuth = fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => { if (!r.ok) window.dispatchEvent(new Event('sc:auth-expired')); })
      .catch(() => {})
      .finally(() => { setTimeout(() => { checkingAuth = null; }, 2000); });
  }
  return checkingAuth;
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      signal,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Cannot reach the server. Check your connection.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if ((res.status === 401 || res.status === 404) && !path.startsWith('/api/auth/')) maybeExpired();
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

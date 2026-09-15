/**
 * Small fetch wrapper used by every API module. Adds the JWT from storage,
 * parses JSON and turns non-2xx responses into ApiError instances.
 */
const STORAGE_KEY = 'pims_auth';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuth(auth) {
  if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  else localStorage.removeItem(STORAGE_KEY);
}

export function getToken() {
  return loadAuth()?.token || null;
}

export async function request(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && token) {
      // Token expired or invalid: notify the auth context so it can log out.
      window.dispatchEvent(new Event('pims:unauthorized'));
    }
    throw new ApiError(response.status, data?.error || response.statusText, data?.details);
  }
  return data;
}

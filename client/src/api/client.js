/**
 * Small fetch wrapper used by every API module. Adds the JWT from storage,
 * parses JSON and turns non-2xx responses into ApiError instances.
 */
import constants from '../../../shared/constants.json';

const { ERROR_CODES } = constants;
const STORAGE_KEY = 'pims_auth';

export class ApiError extends Error {
  constructor(status, message, details, code, params) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code; // stable ERROR_CODES value, translated by useI18n().te
    this.params = params;
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
  // A FormData body (an image upload) sets its own multipart Content-Type.
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  const response = await send(path, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw failure(response, data, token);
  return data;
}

/**
 * GETs a file with the bearer token and returns it as a Blob. Chat images sit
 * behind an authenticated route, so a plain <img src> cannot load them.
 */
export async function fetchBlob(path) {
  const token = getToken();
  const response = await send(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw failure(response, await response.json().catch(() => null), token);
  return response.blob();
}

async function send(path, init) {
  try {
    return await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, 'Network error', undefined, 'NETWORK');
  }
}

// 401s that mean the session itself is gone. A wrong password while signed in
// (deleting the account) is also a 401 but must not sign the user out.
const SESSION_ENDED = [ERROR_CODES.AUTH_INVALID_TOKEN, ERROR_CODES.AUTH_REQUIRED];

function failure(response, data, token) {
  if (response.status === 401 && token && (!data?.code || SESSION_ENDED.includes(data.code))) {
    // Token expired, invalid or its user deleted: notify the auth context so it can log out.
    window.dispatchEvent(new Event('pims:unauthorized'));
  }
  return new ApiError(response.status, data?.error || response.statusText, data?.details, data?.code, data?.params);
}

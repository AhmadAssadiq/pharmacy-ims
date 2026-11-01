// Every request to our server goes through here (the files next to this one use it).
//
// It uses axios and adds two things to every request:
//   1. the login token, in the header   Authorization: Bearer <token>
//   2. error handling: a failed request becomes an ApiError with the server's message,
//      code, params and field details - and if the server says the login token is no longer
//      valid, the app signs the user out.
import axios from 'axios';
import constants from '../../../shared/constants.json';

const { ERROR_CODES } = constants;

// Where the signed-in user and token are remembered between visits
const STORAGE_KEY = 'pims_auth';

// The error every API call throws when it fails
export class ApiError extends Error {
  constructor(status, message, details, code, params) {
    super(message);
    this.status = status; // HTTP status, e.g. 404 (0 when the server could not be reached)
    this.details = details; // per-field form messages, e.g. { name: 'Name is required' }
    this.code = code; // fixed error code, shown in the user's language by useI18n().te
    this.params = params; // values for that message, e.g. { count: 15 }
  }
}

// Reads the saved { user, token } (or null when signed out)
export function loadAuth() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

// Saves { user, token }, or forgets them when given null
export function saveAuth(auth) {
  if (auth) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

// The saved login token, or null
export function getToken() {
  const auth = loadAuth();
  return auth ? auth.token : null;
}

// One axios instance for the whole app: every URL starts with /api
const api = axios.create({ baseURL: '/api' });

// Before every request: add the login token
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// After every failed request: turn the error into an ApiError
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // No answer at all: the server is not running or the network is down
    if (!error.response) {
      return Promise.reject(new ApiError(0, 'Network error', undefined, ERROR_CODES.NETWORK));
    }

    const { status } = error.response;
    let data = error.response.data;
    // A failed file download arrives as a Blob: read the JSON error inside it
    if (data instanceof Blob) {
      try {
        data = JSON.parse(await data.text());
      } catch {
        data = null;
      }
    }
    const body = data && typeof data === 'object' ? data : {};

    // 401 with these codes means the session itself is over (token expired, account deleted,
    // password reset). Tell AuthContext to sign out. A wrong password while signed in (when
    // deleting the account) is also a 401, but must NOT sign the user out.
    const sessionEnded = !body.code || body.code === ERROR_CODES.AUTH_INVALID_TOKEN || body.code === ERROR_CODES.AUTH_REQUIRED;
    if (status === 401 && getToken() && sessionEnded) {
      window.dispatchEvent(new Event('pims:unauthorized'));
    }

    return Promise.reject(new ApiError(status, body.error || error.message, body.details, body.code, body.params));
  }
);

// Sends a request and returns the JSON the server answered with.
//   request('/medications')                                   -> GET
//   request('/medications', { method: 'POST', body: {...} })  -> POST with a JSON body
// A FormData body (an image upload) is sent as a multipart form.
export async function request(path, { method = 'GET', body } = {}) {
  const response = await api.request({ url: path, method, data: body });
  // 204 No Content has no body
  return response.status === 204 ? null : response.data;
}

// Downloads a file (a chat image) as a Blob. Chat images need the login token,
// so a plain <img src="..."> cannot load them.
export async function fetchBlob(path) {
  const response = await api.get(path, { responseType: 'blob' });
  return response.data;
}

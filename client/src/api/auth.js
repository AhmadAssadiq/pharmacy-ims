import { request } from './client';

export const registerRequest = (payload) => request('/auth/register', { method: 'POST', body: payload });
export const loginRequest = (payload) => request('/auth/login', { method: 'POST', body: payload });
export const meRequest = () => request('/auth/me');

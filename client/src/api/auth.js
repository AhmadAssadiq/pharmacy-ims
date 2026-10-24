import { request } from './client';

export const registerRequest = (payload) => request('/auth/register', { method: 'POST', body: payload });
export const loginRequest = (payload) => request('/auth/login', { method: 'POST', body: payload });
export const meRequest = () => request('/auth/me');
/** `lang` picks the language of the reset email. */
export const forgotPasswordRequest = (email, lang) =>
  request('/auth/forgot-password', { method: 'POST', body: { email, lang } });
export const resetPasswordRequest = (payload) => request('/auth/reset-password', { method: 'POST', body: payload });
export const deleteAccountRequest = (password) => request('/auth/me', { method: 'DELETE', body: { password } });
export const updatePhoneRequest = (phone) => request('/auth/me/phone', { method: 'PUT', body: { phone } });

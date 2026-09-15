import { request } from './client';

export const openMySession = () => request('/chat/sessions', { method: 'POST' });
export const fetchSessions = () => request('/chat/sessions');
export const fetchMessages = (sessionId) => request(`/chat/sessions/${sessionId}/messages`);
export const postMessage = (sessionId, content) =>
  request(`/chat/sessions/${sessionId}/messages`, { method: 'POST', body: { content } });

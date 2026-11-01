// Calls to the server for chat: open a conversation, list conversations and messages, send
// text or an image, and download an image (images need the login token, so they come as a Blob).
import { fetchBlob, request } from './client';

export const openMySession = () => request('/chat/sessions', { method: 'POST' });
export const fetchSessions = () => request('/chat/sessions');
export const fetchMessages = (sessionId) => request(`/chat/sessions/${sessionId}/messages`);
export const postMessage = (sessionId, content) =>
  request(`/chat/sessions/${sessionId}/messages`, { method: 'POST', body: { content } });

/** An image message: the file plus an optional caption, as multipart form data. */
export const postImage = (sessionId, file, caption) => {
  const form = new FormData();
  form.append('caption', caption || '');
  form.append('image', file);
  return request(`/chat/sessions/${sessionId}/attachments`, { method: 'POST', body: form });
};

export const fetchAttachment = (key) => fetchBlob(`/chat/attachments/${encodeURIComponent(key)}`);

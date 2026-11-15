// Calls to the server for Rafiq, the AI assistant (GP2 addition).
import { request } from './client';

// My conversation with Rafiq: { messages: [{ id, role, content, created_at }] }
export const fetchAssistantMessages = () => request('/assistant/messages');

// Asks a question. Answers { question, answer }: the two saved messages.
export const askAssistant = (content) => request('/assistant/messages', { method: 'POST', body: { content } });

// Deletes my whole conversation with Rafiq
export const clearAssistantMessages = () => request('/assistant/messages', { method: 'DELETE' });

// Calls to the server for the notification bell and "tell me when it's back" (GP2 additions).
import { request } from './client';

// What the bell shows: { items: [{ type, count, link, names? }], total }
export const fetchNotifications = () => request('/notifications');

// "I am looking at My orders now" (stops the bell mentioning orders already seen)
export const markOrdersSeen = () => request('/preorders/mine/seen', { method: 'POST' });

// "I have this conversation open" (its messages stop counting as unread)
export const markChatRead = (sessionId) => request(`/chat/sessions/${sessionId}/read`, { method: 'POST' });

// Tell me when it's back: the medications I asked about, ask, stop asking,
// and "I have seen that these are back"
export const fetchWatches = () => request('/watches');
export const watchMedication = (medicationId) => request(`/watches/${medicationId}`, { method: 'POST' });
export const unwatchMedication = (medicationId) => request(`/watches/${medicationId}`, { method: 'DELETE' });
export const clearWatchesBackInStock = () => request('/watches/clear-available', { method: 'POST' });

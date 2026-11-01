// Calls to the server for reorder alerts (see api/client.js for how requests are sent).
import { request } from './client';

export const fetchAlerts = () => request('/alerts');
export const dismissAlert = (id) => request(`/alerts/${id}/dismiss`, { method: 'PATCH' });

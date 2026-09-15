import { request } from './client';

export const fetchAlerts = () => request('/alerts');
export const dismissAlert = (id) => request(`/alerts/${id}/dismiss`, { method: 'PATCH' });

import { request } from './client';

export const createPreorder = (payload) => request('/preorders', { method: 'POST', body: payload });
export const fetchMyPreorders = () => request('/preorders/mine');
export const cancelMyPreorder = (id) => request(`/preorders/${id}/cancel`, { method: 'POST' });

export const fetchPreorders = () => request('/preorders');
export const updatePreorderStatus = (id, status) => request(`/preorders/${id}`, { method: 'PATCH', body: { status } });

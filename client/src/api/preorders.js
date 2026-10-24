import { request } from './client';

export const createPreorder = (payload) => request('/preorders', { method: 'POST', body: payload });
export const fetchMyPreorders = () => request('/preorders/mine');
export const cancelMyPreorder = (id) => request(`/preorders/${id}/cancel`, { method: 'POST' });

export const fetchPreorders = () => request('/preorders');
/** `delivery` ({ quantity, expiry_date, batch_number }) goes with "ready": the lot that arrived for the request. */
export const updatePreorderStatus = (id, status, delivery) =>
  request(`/preorders/${id}`, { method: 'PATCH', body: delivery ? { status, delivery } : { status } });

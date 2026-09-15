import { request } from './client';

export const fetchMedications = () => request('/medications');
export const createMedication = (payload) => request('/medications', { method: 'POST', body: payload });
export const updateMedication = (id, payload) => request(`/medications/${id}`, { method: 'PUT', body: payload });
export const updateMedicationQuantity = (id, quantity) =>
  request(`/medications/${id}/quantity`, { method: 'PATCH', body: { quantity } });
export const deleteMedication = (id) => request(`/medications/${id}`, { method: 'DELETE' });

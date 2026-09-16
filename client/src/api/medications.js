import { request } from './client';

export const fetchMedications = () => request('/medications');
export const createMedication = (payload) => request('/medications', { method: 'POST', body: payload });
export const updateMedication = (id, payload) => request(`/medications/${id}`, { method: 'PUT', body: payload });
export const deleteMedication = (id) => request(`/medications/${id}`, { method: 'DELETE' });

export const fetchBatches = (medicationId) => request(`/medications/${medicationId}/batches`);
export const createBatch = (medicationId, payload) =>
  request(`/medications/${medicationId}/batches`, { method: 'POST', body: payload });
export const updateBatch = (batchId, payload) =>
  request(`/medications/batches/${batchId}`, { method: 'PATCH', body: payload });
export const deleteBatch = (batchId) => request(`/medications/batches/${batchId}`, { method: 'DELETE' });

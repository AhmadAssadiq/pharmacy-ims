import { request } from './client';

export const fetchRecentSales = () => request('/sales');
export const recordSale = (payload) => request('/sales', { method: 'POST', body: payload });
export const previewSale = (medicationId, quantity) =>
  request(
    `/sales/preview?medication_id=${encodeURIComponent(medicationId)}&quantity=${encodeURIComponent(quantity)}`
  );

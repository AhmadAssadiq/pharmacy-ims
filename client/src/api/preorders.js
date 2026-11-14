// Calls to the server for orders: patients place and cancel them, staff move them on
// and check prescriptions.
import { fetchBlob, request } from './client';

/**
 * Places an order. It is sent as a form so the prescription photo can go with it:
 *   lines: [{ medication_id, quantity }], note, paymentMethod ('cash' or 'card'),
 *   prescriptionFile: the photo (only when the order needs one).
 */
export const createOrder = ({ lines, note, paymentMethod, prescriptionFile }) => {
  const form = new FormData();
  form.append('items', JSON.stringify(lines));
  form.append('note', note || '');
  form.append('payment_method', paymentMethod);
  if (prescriptionFile) {
    form.append('prescription', prescriptionFile);
  }
  return request('/preorders', { method: 'POST', body: form });
};

export const fetchMyOrders = () => request('/preorders/mine');
export const cancelMyOrder = (id) => request(`/preorders/${id}/cancel`, { method: 'POST' });

export const fetchOrders = () => request('/preorders');
export const updateOrderStatus = (id, status) => request(`/preorders/${id}`, { method: 'PATCH', body: { status } });

/** Staff approve ('approve') or reject ('reject', with a reason) an order's prescription. */
export const decidePrescription = (id, decision, reason) =>
  request(`/preorders/${id}/prescription`, { method: 'POST', body: { decision, reason } });

/** The prescription photo of an order (it needs the login token, so it comes as a Blob). */
export const fetchPrescription = (id) => fetchBlob(`/preorders/${id}/prescription`);

// Call to the server for the patient's in-stock / out-of-stock list (FR 7).
import { request } from './client';

export const fetchAvailability = () => request('/availability');

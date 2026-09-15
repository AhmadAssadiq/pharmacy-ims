import { request } from './client';

export const fetchAvailability = () => request('/availability');

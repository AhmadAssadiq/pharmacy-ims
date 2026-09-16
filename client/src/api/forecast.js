import { request } from './client';

export const fetchMedicationForecast = (medicationId) => request(`/forecast/${medicationId}`);

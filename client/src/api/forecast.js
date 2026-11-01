// Call to the server for one medication's sales history and forecast (the Forecast page).
import { request } from './client';

export const fetchMedicationForecast = (medicationId) => request(`/forecast/${medicationId}`);

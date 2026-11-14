// Calls to the server for the interaction check (GP2 addition).
import { request } from './client';

// Checks the medications with these ids against each other.
// Answers { checked, interactions: [{ type, severity, medication_names, ... }] }.
export const checkInteractions = (medicationIds) =>
  request('/interactions/check', { method: 'POST', body: { medication_ids: medicationIds } });

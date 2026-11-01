// Shared constants (roles, limits, error codes...).
// The values live in shared/constants.json so the React client uses exactly the same ones.
// This file only re-exports them, so server files can write:
//   import { ROLES, ERROR_CODES } from '../constants.js';
import constants from '../../shared/constants.json' with { type: 'json' };

export const {
  ROLES,
  ALERT_STATUS,
  LOW_STOCK_THRESHOLD,
  NEAR_EXPIRY_DAYS,
  FORECAST_HORIZON_DAYS,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_MINUTES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_MINUTES,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_TYPES,
  CHAT_MESSAGE_MAX_LENGTH,
  PREORDER_STATUS,
  PREORDER_MAX_QUANTITY,
  PREORDER_NOTE_MAX_LENGTH,
  ERROR_CODES,
} = constants;

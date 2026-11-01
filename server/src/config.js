// All server settings in one place.
// The values come from server/.env (copy server/.env.example to create it).
// If a setting is missing from .env, the default written after || is used.
import path from 'node:path';

export const config = {
  // Port of the API and chat server
  port: Number(process.env.PORT) || 4000,

  // MySQL connection
  database: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'pharmacy_ims',
  },

  // Login tokens (JWT): the secret they are signed with and how long they last
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  // Address of the React app (allowed by CORS, and used in password reset links)
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // Address of the Python forecasting service
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001',

  // When the reorder forecast runs (cron format). Default: every hour, on the hour.
  forecastCron: process.env.FORECAST_CRON || '0 * * * *',

  // Fill days missing from the demo sales history before each forecast run
  // (see services/demoSalesService.js). On unless set to "false".
  demoSalesTopUp: process.env.DEMO_SALES_TOPUP !== 'false',

  nodeEnv: process.env.NODE_ENV || 'development',

  // When "true" (and not in production), password reset links are also printed to the console
  authResetDebug: process.env.AUTH_RESET_DEBUG === 'true',

  // Folder where chat images are saved. Default: server/uploads
  uploadsDir: path.resolve(process.env.UPLOADS_DIR || path.join(import.meta.dirname, '../uploads')),

  // Outgoing email for password reset links. If SMTP_HOST is empty, no email is sent.
  email: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    // Port 465 uses TLS from the start; port 587 upgrades with STARTTLS
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASS || '',
    // Only a local test mail catcher (such as Mailpit) should ever need "false"
    requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
    from: process.env.MAIL_FROM || '',
  },
};

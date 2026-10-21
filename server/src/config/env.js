/**
 * Central place that reads environment variables and applies defaults, so the
 * rest of the code never touches process.env directly.
 */
const path = require('path');

const env = {
  port: Number(process.env.PORT) || 4000,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pharmacy_ims',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001',
  forecastCron: process.env.FORECAST_CRON || '0 * * * *',
  nodeEnv: process.env.NODE_ENV || 'development',
  // Prints password reset links to the server console. There is no mail
  // service yet; this is for development only and is ignored in production.
  authResetDebug: process.env.AUTH_RESET_DEBUG === 'true',
  // Chat images live on disk here, never in the database and never served
  // statically (see services/attachmentService.js). Default: server/uploads.
  uploadsDir: path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads')),
};

module.exports = env;

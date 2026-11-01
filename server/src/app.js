// The Express app: general middleware, every /api route, and the error handler.
// (index.js starts it; keeping it separate means tests can load it without opening a port.)
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import medicationRoutes from './routes/medications.js';
import salesRoutes from './routes/sales.js';
import preorderRoutes from './routes/preorders.js';
import chatRoutes from './routes/chat.js';
import availabilityRoutes from './routes/availability.js';
import { forecastRouter, alertsRouter } from './routes/forecast.js';

export const app = express();

// Allow the React app (on another port during development) to call this API
app.use(cors({ origin: config.clientOrigin }));

// Read JSON request bodies (at most 100 KB) into req.body
app.use(express.json({ limit: '100kb' }));

// A quick "is the server up?" check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Every feature's routes, each under its own path
app.use('/api/auth', authRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/preorders', preorderRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/forecast', forecastRouter);
app.use('/api/alerts', alertsRouter);

// Any other URL: 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Turns every error into a JSON answer (must be added last)
app.use(errorHandler);

/**
 * Express application: middleware, routes and error handling.
 * Kept separate from index.js so it can be imported without opening a port.
 */
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: env.clientOrigin }));
app.use(express.json({ limit: '100kb' }));

app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;

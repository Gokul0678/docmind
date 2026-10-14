const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json({ limit: '100kb' }));
app.get('/api/health', (req, res) => res.json({ ok: true, provider: process.env.LLM_PROVIDER || 'mock' }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);
module.exports = app;

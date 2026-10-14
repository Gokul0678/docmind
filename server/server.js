const app = require('./src/app');
const pool = require('./src/config/db');
const PORT = process.env.PORT || 5000;

pool.query('SELECT 1')
  .then(() => app.listen(PORT, () => console.log(`API running on port ${PORT} (AI provider: ${process.env.LLM_PROVIDER || 'mock'})`)))
  .catch((e) => { console.error('PostgreSQL connection failed:', e.message); process.exit(1); });

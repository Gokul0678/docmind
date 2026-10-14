const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 5,                          // small pool: free hosted databases allow few connections
  idleTimeoutMillis: 30000,        // close idle connections before the host suspends the database
  connectionTimeoutMillis: 15000,  // allow time for a sleeping database to wake up
});

// Hosted databases (e.g. Neon) drop idle connections when they suspend. Without this handler,
// that error would crash the whole server.
pool.on('error', (err) => console.error('Idle database connection error:', err.message));

module.exports = pool;

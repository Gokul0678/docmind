const fs = require('fs'), path = require('path');
const pool = require('../src/config/db');
pool.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'))
  .then(() => console.log('Schema applied'))
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => pool.end());

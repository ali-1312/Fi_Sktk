require('dotenv').config({ override: true });
const { Pool } = require('pg');

// Using connectionString is much more reliable for production/Vercel
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};

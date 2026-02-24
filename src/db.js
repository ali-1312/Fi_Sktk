require('dotenv').config({ override: true });
const { Pool } = require('pg');

const cleanHost = process.env.DB_HOST ? process.env.DB_HOST.replace(/^https?:\/\//, '') : '';

const pool = new Pool({
  user: process.env.DB_USER,
  host: cleanHost,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 6543,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000, // 10 seconds timeout
  max: 10, // Max clients in pool
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};

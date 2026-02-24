require('dotenv').config({ override: true });
const { Pool } = require('pg');

// Auto-clean host string (remove https:// or http:// if present)
const cleanHost = process.env.DB_HOST ? process.env.DB_HOST.replace(/^https?:\/\//, '') : '';

const pool = new Pool({
  user: process.env.DB_USER,
  host: cleanHost,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};

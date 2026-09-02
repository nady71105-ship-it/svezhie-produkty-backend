import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL не задан — скопируйте .env.example в .env и заполните его');
}

// Supabase (и большинство облачных Postgres) требует SSL снаружи их сети —
// rejectUnauthorized: false достаточно для MVP с их управляемым сертификатом.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

export async function query(text, params) {
  return pool.query(text, params);
}

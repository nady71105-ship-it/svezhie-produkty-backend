// Простейший «мигратор» для MVP: один файл schema.sql, идемпотентный
// (create table if not exists / on conflict do nothing) — можно запускать
// повторно без вреда. Для роста проекта потом можно перейти на нормальный
// инструмент миграций (node-pg-migrate, Prisma Migrate и т.п.).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  console.log('[migrate] применяю schema.sql...');
  await pool.query(sql);
  console.log('[migrate] готово');
  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] ошибка:', err);
  process.exit(1);
});

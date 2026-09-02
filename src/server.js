    import 'dotenv/config';
  import express from 'express';
  import cors from 'cors';
  import path from 'path';
  import { fileURLToPath } from 'url';
  // Патчит Express, чтобы ошибка/отклонённый промис внутри async-обработчика
// маршрута сама долетала до обработчика ошибок ниже, а не роняла весь
// процесс целиком (именно так и упал сервер при первой проверке — любой
// сбой похода в БД убивал бы весь backend на реальном хостинге).
import 'express-async-errors';

import { categoriesRouter } from './routes/categories.js';
  import { listingsRouter } from './routes/listings.js';
  import { usersRouter } from './routes/users.js';
  import { reviewsRouter } from './routes/reviews.js';
  import { analyticsRouter } from './routes/analytics.js';
  import { startBot } from './bot/bot.js';

// Последний рубеж защиты: если какая-то зависимость (например, сетевой
// транспорт бота) кинет ошибку мимо всех своих собственных обработчиков,
// процесс не должен падать целиком и обрывать API для покупателей и
// продавцов — логируем и живём дальше. В идеале каждая подсистема ловит
// свои ошибки сама (см. bot.js), это именно страховка на случай, если
// где-то её всё-таки не поймали.
process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException (сервер не остановлен):', err);
});
  process.on('unhandledRejection', (err) => {
    console.error('[process] unhandledRejection (сервер не остановлен):', err);
  });

const app = express();
  app.use(cors());
  app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/categories', categoriesRouter);
  app.use('/listings', listingsRouter);
  app.use('/users', usersRouter);
  app.use('/reviews', reviewsRouter);
  app.use('/admin/analytics', analyticsRouter);

// ── Статика мини-аппа (фронтенд, public/) ──────────────────────────────
// Тот же самый деплой на Railway отдаёт и API, и файлы мини-аппа — не
// нужен отдельный хостинг для фронтенда. MINIAPP_URL в .env указывает
// сюда же (см. README).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Единообразная обработка ошибок — чтобы в проде не утекал стектрейс
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

// SPA-фолбэк: любой GET, не пойманный роутами/статикой выше (и не
// начинающийся с /health, /categories, /listings, /users, /reviews,
// /admin), отдаём index.html — навигация внутри мини-аппа своя, без
// перезагрузки страницы.
app.get(/^\/(?!health|categories|listings|users|reviews|admin).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`[server] слушаю на порту ${port}`);
  });

// Бот запускаем в том же процессе — для MVP отдельный сервис не нужен.
// Если TELEGRAM_BOT_TOKEN не задан, просто предупреждаем и не падаем —
// удобно, чтобы backend можно было поднять и проверить до того, как
// готов токен бота.
if (process.env.TELEGRAM_BOT_TOKEN) {
  startBot();
} else {
  console.warn('[bot] TELEGRAM_BOT_TOKEN не задан — бот не запущен, работает только API');
}

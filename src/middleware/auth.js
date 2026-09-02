import { verifyTelegramInitData } from '../telegram/verifyInitData.js';
import { pool } from '../db/pool.js';

// Мини-апп на каждый запрос кладёт initData (Telegram.WebApp.initData) в
// заголовок x-telegram-init-data. Проверяем подпись и находим/создаём
// пользователя в нашей БД — своей регистрации/паролей нет (раздел 7 концепта).
export async function requireTelegramAuth(req, res, next) {
  const initData = req.get('x-telegram-init-data');
  const result = verifyTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN);

  if (!result.ok) {
    return res.status(401).json({ error: 'unauthorized', reason: result.reason });
  }

  const tgUser = result.user;
  if (!tgUser?.id) {
    return res.status(401).json({ error: 'unauthorized', reason: 'в initData нет user' });
  }

  const { rows } = await pool.query(
    `insert into users (telegram_id, first_name, username)
     values ($1, $2, $3)
     on conflict (telegram_id)
     do update set first_name = excluded.first_name, username = excluded.username
     returning *`,
    [tgUser.id, tgUser.first_name || 'Без имени', tgUser.username || null]
  );

  req.user = rows[0];
  next();
}

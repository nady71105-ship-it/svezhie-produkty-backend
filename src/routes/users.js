import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireTelegramAuth } from '../middleware/auth.js';

export const usersRouter = Router();

// Текущий пользователь (создаётся/обновляется автоматически в auth-мидлваре)
usersRouter.get('/me', requireTelegramAuth, async (req, res) => {
  res.json(req.user);
});

// Переключатель «показывать @username для быстрой связи» — это и есть
// согласие продавца на бесплатный вариант переписки, раздел 5.1
usersRouter.patch('/me/show-contact', requireTelegramAuth, async (req, res) => {
  const { show_contact } = req.body;
  if (typeof show_contact !== 'boolean') return res.status(400).json({ error: 'show_contact должен быть true/false' });

  const { rows } = await pool.query(
    `update users set show_contact = $1 where id = $2 returning *`,
    [show_contact, req.user.id]
  );
  res.json(rows[0]);
});

// Согласие на рассылки (38-ФЗ, раздел 15) — по умолчанию выключено
usersRouter.patch('/me/broadcast-opt-in', requireTelegramAuth, async (req, res) => {
  const { broadcast_opt_in } = req.body;
  if (typeof broadcast_opt_in !== 'boolean') return res.status(400).json({ error: 'broadcast_opt_in должен быть true/false' });

  const { rows } = await pool.query(
    `update users set broadcast_opt_in = $1 where id = $2 returning *`,
    [broadcast_opt_in, req.user.id]
  );
  res.json(rows[0]);
});

// Публичный профиль продавца (раздел 4, 7) — рейтинг, сделки, отзывы
usersRouter.get('/:id', async (req, res) => {
  const { rows: userRows } = await pool.query(
    `select id, first_name, rating, deals_count, created_at from users where id = $1`,
    [req.params.id]
  );
  if (!userRows.length) return res.status(404).json({ error: 'не найден' });

  const { rows: reviewRows } = await pool.query(
    `select r.rating, r.comment, r.created_at, a.first_name as author_name
     from reviews r join users a on a.id = r.author_id
     where r.seller_id = $1
     order by r.created_at desc
     limit 50`,
    [req.params.id]
  );

  res.json({ ...userRows[0], reviews: reviewRows });
});

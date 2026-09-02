import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireTelegramAuth } from '../middleware/auth.js';

export const reviewsRouter = Router();

// Оставить отзыв продавцу после сделки (раздел 3, 7)
reviewsRouter.post('/', requireTelegramAuth, async (req, res) => {
  const { seller_id, listing_id, rating, comment } = req.body;
  if (!seller_id || !rating) return res.status(400).json({ error: 'нужны seller_id и rating' });
  if (seller_id === req.user.id) return res.status(400).json({ error: 'нельзя оставить отзыв самому себе' });

  const client = await pool.connect();
  try {
    await client.query('begin');

    await client.query(
      `insert into reviews (seller_id, author_id, listing_id, rating, comment)
       values ($1, $2, $3, $4, $5)`,
      [seller_id, req.user.id, listing_id || null, rating, comment || null]
    );

    // Пересчитываем средний рейтинг и счётчик сделок продавца
    const { rows } = await client.query(
      `select round(avg(rating)::numeric, 1) as avg_rating, count(*) as cnt
       from reviews where seller_id = $1`,
      [seller_id]
    );

    await client.query(
      `update users set rating = $1, deals_count = $2 where id = $3`,
      [rows[0].avg_rating, rows[0].cnt, seller_id]
    );

    await client.query('commit');
    res.status(201).json({ ok: true });
  } catch (err) {
    await client.query('rollback');
    if (err.code === '23505') return res.status(409).json({ error: 'вы уже оставляли отзыв по этой сделке' });
    throw err;
  } finally {
    client.release();
  }
});

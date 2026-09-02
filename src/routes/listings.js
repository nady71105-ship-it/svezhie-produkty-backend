import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireTelegramAuth } from '../middleware/auth.js';

export const listingsRouter = Router();

// ── Создать объявление ────────────────────────────────────────────────
listingsRouter.post('/', requireTelegramAuth, async (req, res) => {
  const {
    category_slug, title, description, photo_file_id,
    price, unit,
    origin: { lat: originLat, lng: originLng } = {},
    dest: { lat: destLat, lng: destLng } = {},
    dest_radius_m = 1500,
    window_start, window_end,
  } = req.body;

  if (!category_slug || !title || !price || !unit || !originLat || !destLat || !window_start || !window_end) {
    return res.status(400).json({ error: 'не хватает обязательных полей' });
  }

  const { rows } = await pool.query(
    `insert into listings
       (seller_id, category_slug, title, description, photo_file_id, price, unit,
        origin_point, dest_point, dest_radius_m, window_start, window_end)
     values
       ($1, $2, $3, $4, $5, $6, $7,
        ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography,
        ST_SetSRID(ST_MakePoint($10, $11), 4326)::geography,
        $12, $13, $14)
     returning id, created_at`,
    [req.user.id, category_slug, title, description || null, photo_file_id || null, price, unit,
     originLng, originLat, destLng, destLat, dest_radius_m, window_start, window_end]
  );

  res.status(201).json(rows[0]);
});

// ── Поиск / список (карта и фильтры — один и тот же эндпоинт) ─────────
// GET /listings?lat=..&lng=..&radius_km=3&category=vegetables&topSellers=1&sort=price_asc
listingsRouter.get('/', async (req, res) => {
  const {
    lat, lng, radius_km = 5,
    category, topSellers, sort = 'created_desc',
  } = req.query;

  const conditions = [`l.status = 'active'`];
  const params = [];

  if (lat && lng) {
    params.push(lng, lat, Number(radius_km) * 1000);
    conditions.push(
      `ST_DWithin(l.dest_point, ST_SetSRID(ST_MakePoint($${params.length - 2}, $${params.length - 1}), 4326)::geography, $${params.length})`
    );
  }

  if (category) {
    params.push(category);
    conditions.push(`l.category_slug = $${params.length}`);
  }

  if (topSellers === '1' || topSellers === 'true') {
    conditions.push(`u.rating >= 4.7`);
  }

  const orderBy = {
    price_asc: 'l.price asc',
    price_desc: 'l.price desc',
    rating_desc: 'u.rating desc',
    deals_desc: 'u.deals_count desc',
    created_desc: 'l.created_at desc',
  }[sort] || 'l.created_at desc';

  const { rows } = await pool.query(
    `select
        l.id, l.category_slug, l.title, l.description, l.photo_file_id,
        l.price, l.unit, l.window_start, l.window_end, l.created_at,
        ST_Y(l.dest_point::geometry) as dest_lat, ST_X(l.dest_point::geometry) as dest_lng,
        u.id as seller_id, u.first_name as seller_name, u.rating as seller_rating,
        u.deals_count as seller_deals
     from listings l
     join users u on u.id = l.seller_id
     where ${conditions.join(' and ')}
     order by ${orderBy}
     limit 100`,
    params
  );

  res.json(rows);
});

// ── Архивировать своё объявление вручную ────────────────────────────────
listingsRouter.post('/:id/archive', requireTelegramAuth, async (req, res) => {
  const { rows } = await pool.query(
    `update listings set status = 'archived', archived_at = now()
     where id = $1 and seller_id = $2
     returning id`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'объявление не найдено или не ваше' });
  res.json({ ok: true });
});

// ── Клик «Написать продавцу» ───────────────────────────────────────────
// Не даём текст переписки (её у нас нет, раздел 5.1) — просто считаем
// событие для воронки в аналитике и отдаём @username продавца, если он
// разрешил показывать контакт.
listingsRouter.post('/:id/contact-click', requireTelegramAuth, async (req, res) => {
  const { rows } = await pool.query(
    `select u.username, u.show_contact
     from listings l join users u on u.id = l.seller_id
     where l.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'объявление не найдено' });

  await pool.query(
    `insert into contact_clicks (listing_id, buyer_id) values ($1, $2)`,
    [req.params.id, req.user.id]
  );

  const seller = rows[0];
  if (seller.show_contact && seller.username) {
    return res.json({ contactAvailable: true, telegramLink: `https://t.me/${seller.username}` });
  }
  res.json({ contactAvailable: false });
});

import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAdmin } from '../middleware/adminAuth.js';

export const analyticsRouter = Router();

// Всё, что описано в разделе 11.4 концепта — только бесплатные счётчики
// по своей же базе, без сторонних сервисов аналитики.
analyticsRouter.get('/summary', requireAdmin, async (_req, res) => {
  const [dealsWeek, newSellersWeek, categoryDemand, funnel, repeatBuyers, reportsWeek, autoArchived] = await Promise.all([
    pool.query(`select count(*) from reviews where created_at > now() - interval '7 days'`),
    pool.query(`select count(*) from users where created_at > now() - interval '7 days'`),
    pool.query(`select category_slug, count(*) as cnt from listings where created_at > now() - interval '7 days' group by category_slug order by cnt desc`),
    pool.query(`with base as (select count(*) as n from listings where created_at > now() - interval '30 days'), contacted as (select count(distinct listing_id) as n from contact_clicks where created_at > now() - interval '30 days'), dealt as (select count(*) as n from reviews where created_at > now() - interval '30 days') select base.n as opened, contacted.n as contacted, dealt.n as closed from base, contacted, dealt`),
    pool.query(`select count(*) filter (where cnt > 1)::float / nullif(count(*), 0) as ratio from (select author_id, count(*) as cnt from reviews group by author_id) t`),
    pool.query(`select count(*) from reports where created_at > now() - interval '7 days'`),
    pool.query(`select count(*) from listings where status = 'archived' and archived_at > now() - interval '7 days'`),
    ]);

                    res.json({
                      dealsThisWeek: Number(dealsWeek.rows[0].count),
                      newSellersThisWeek: Number(newSellersWeek.rows[0].count),
                      categoryDemand: categoryDemand.rows,
                      funnel: funnel.rows[0],
                      repeatBuyerRatio: Number(repeatBuyers.rows[0].ratio || 0),
                      reportsThisWeek: Number(reportsWeek.rows[0].count),
                      autoArchivedThisWeek: Number(autoArchived.rows[0].count),
                    });
});

// ── Журнал согласий (152-ФЗ и общая защита) ──────────────────────────────
// Список для дашборда — последние записи с именем/username, кто на что
// согласился и когда. Полный текст согласия в списке не отдаём (длинный,
// не нужен для обзора) — он есть в CSV-выгрузке ниже.
analyticsRouter.get('/consents', requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { rows } = await pool.query(
    `select c.id, c.telegram_id, u.first_name, u.username, c.context, c.listing_id,
            c.consent_version, c.ip_address, c.created_at
     from consents c
     left join users u on u.id = c.user_id
     order by c.created_at desc
     limit $1`,
    [limit]
  );
  res.json(rows);
});

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Выгрузка журнала согласий в CSV ──────────────────────────────────────
// Полная запись, включая точный текст, который видел человек, и IP/User-
// Agent — то самое «доказательство», о котором просила Надин.
analyticsRouter.get('/consents/export', requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(
    `select c.id, c.telegram_id, u.first_name, u.username, c.context, c.listing_id,
            c.consent_version, c.consent_text, c.ip_address, c.user_agent, c.created_at
     from consents c
     left join users u on u.id = c.user_id
     order by c.created_at desc`
  );
  const header = ['id', 'telegram_id', 'first_name', 'username', 'context', 'listing_id',
    'consent_version', 'consent_text', 'ip_address', 'user_agent', 'created_at'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(header.map((k) => csvCell(r[k])).join(','));
  }
  const csv = '﻿' + lines.join('\r\n'); // BOM — чтобы Excel сразу понял UTF-8
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="consents-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

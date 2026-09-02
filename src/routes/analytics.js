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

import { Router } from 'express';
import { pool } from '../db/pool.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query('select slug, title from categories order by slug');
  res.json(rows);
});

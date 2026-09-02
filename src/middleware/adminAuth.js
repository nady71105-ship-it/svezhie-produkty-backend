// Упрощённая защита админ-эндпоинтов для MVP: общий секретный токен в
// заголовке, а не полноценная система ролей — этого достаточно, пока
// админ-панель использует один человек (Надин). Токен задаётся в .env
// как ADMIN_TOKEN и передаётся из админ-панели в заголовке x-admin-token.
export function requireAdmin(req, res, next) {
  const token = req.get('x-admin-token');
  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).json({ error: 'ADMIN_TOKEN не задан на сервере' });
  }
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

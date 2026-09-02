// Проверка подлинности initData, который Telegram Mini App присылает при
// открытии приложения. Без этой проверки любой человек мог бы прислать
// "я — Ирина, telegram_id 12345" без реального Telegram — обязательный шаг
// для настоящей (не макетной) авторизации.
// Алгоритм — официальный, см. https://core.telegram.org/bots/webapps
import crypto from 'node:crypto';

export function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return { ok: false, reason: 'нет initData или токена бота' };

const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'в initData нет hash' };
  params.delete('hash');

const dataCheckString = [...params.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

if (computedHash !== hash) return { ok: false, reason: 'подпись не совпадает' };

const authDate = Number(params.get('auth_date') || 0);
  const ageSeconds = Date.now() / 1000 - authDate;
  if (ageSeconds > 86400) return { ok: false, reason: 'initData старше суток, попросите переоткрыть приложение' };

const userJson = params.get('user');
  const user = userJson ? JSON.parse(userJson) : null;

return { ok: true, user };
}

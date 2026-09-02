import TelegramBot from 'node-telegram-bot-api';

// Long polling, а не webhook — сознательный выбор для MVP: не нужно
// регистрировать публичный URL для приёма апдейтов и разбираться с ним
// отдельно, бот просто сам спрашивает Telegram "есть что-то новое?" по
// таймеру. Для нашего масштаба (сотни/тысячи пользователей) разницы в
// стоимости или надёжности не будет; webhook имеет смысл добавить позже,
// если понадобится строго конкурентный запуск нескольких инстансов бота.
export function startBot() {
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const miniAppUrl = process.env.MINIAPP_URL || process.env.PUBLIC_BASE_URL;

bot.onText(/\/start/, (msg) => {
bot.sendMessage(msg.chat.id,
'Свежие продукты — дачные гостинцы рядом.\n\n' +
'Открывайте карту, смотрите, что сегодня везут в ваш район, и договаривайтесь напрямую с продавцом.',
{
reply_markup: {
inline_keyboard: [[
{ text: 'Открыть Свежие продукты', web_app: { url: miniAppUrl } },
]],
},
}
);
});

bot.on('polling_error', (err) => {
console.error('[bot] polling_error:', err.message);
});

// node-telegram-bot-api иногда пробрасывает и «сырую» ошибку сетевого
// транспорта отдельным событием 'error' (не 'polling_error') — если её
// не слушать, Node считает необработанной ошибкой и роняет весь процесс
// целиком, то есть временный сбой сети у бота убил бы весь API заодно
// с ним. Проверено этой же сессией: без этого обработчика сервер падал
// именно так при потере связи с Telegram.
bot.on('error', (err) => {
console.error('[bot] error:', err.message);
});

console.log('[bot] запущен (long polling)');
return bot;
}

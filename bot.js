import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

if (!TELEGRAM_TOKEN) {
  console.error('TELEGRAM_TOKEN is not set');
  process.exit(1);
}

if (!DEEPSEEK_API_KEY) {
  console.error('DEEPSEEK_API_KEY is not set');
  process.exit(1);
}

const bot = new Telegraf(TELEGRAM_TOKEN);

bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: userMessage
          }
        ]
      })
    });

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || 'Не удалось получить ответ от модели.';

    await ctx.reply(reply);
  } catch (err) {
    console.error('DeepSeek error:', err);
    await ctx.reply('Произошла ошибка при обращении к модели.');
  }
});

bot.launch();
console.log('deepseek-tg-bot запущен');

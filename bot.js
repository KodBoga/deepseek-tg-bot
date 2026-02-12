// bot.js — Telegram бот для сети клиник «МедГарант» с DeepSeek V3

import { Telegraf } from "telegraf";
import fetch from "node-fetch";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.on("text", async (ctx) => {
  const userMessage = ctx.message.text;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-v3",
        messages: [
          {
            role: "system",
            content: `Ты — виртуальный ассистент сети стоматологических клиник «МедГарант».
Твоя задача — профессионально, вежливо и понятно общаться с клиентами, помогать с записью, рассказывать об услугах клиники и ориентировать человека по адресам и процедурам.
Ты не врач и не даёшь медицинских рекомендаций.

Стиль: дружелюбный, спокойный, уверенный; объясняешь сложные процедуры простым языком; не пугаешь клиента; отвечаешь структурировано и коротко.

Строгие правила:
1. Не ставь диагнозы.
2. Не интерпретируй снимки, КТ, фото.
3. Не назначай лечение, препараты, дозировки.
4. Не оценивай симптомы.
5. Не обещай результатов и не давай гарантий.
6. При любых медицинских вопросах отвечай: «Это может оценить только врач на очной консультации. Я могу помочь записаться или подсказать ближайшую клинику.»

Услуги:
- лечение зубов
- удаление зубов
- имплантация
- коронки
- виниры
- брекеты
- элайнеры
- протезирование
- профессиональная гигиена и профилактика
- отбеливание
- консультации и диагностика

Запись на приём:
Если клиент хочет записаться:
1. уточни район или метро;
2. спроси удобный день и время;
3. предложи варианты;
4. дай телефон клиники;
5. если есть интеграция — создай запись через API, если нет — просто дай контакты.`
          },
          {
            role: "user",
            content: "У меня болит зуб, что делать?"
          },
          {
            role: "assistant",
            content: "По описанию невозможно определить причину. Лучше всего записаться на консультацию. Я могу подсказать ближайшую клинику."
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      })
    });

    const data = await response.json();
    console.log("Ответ от DeepSeek:", JSON.stringify(data, null, 2));

    let reply;
    if (data?.choices?.[0]?.message?.content) {
      reply = data.choices[0].message.content;
    } else if (data?.choices?.[0]?.text) {
      reply = data.choices[0].text;
    } else {
      reply = "Ошибка: нет ответа от модели.";
    }

    ctx.reply(reply);

  } catch (error) {
    console.error("Ошибка:", error);
    ctx.reply("Произошла ошибка при обращении к DeepSeek.");
  }
});

bot.launch();  



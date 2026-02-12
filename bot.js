import { Telegraf } from "telegraf";
import fetch from "node-fetch";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Несколько администраторов через запятую
const ADMIN_CHAT_IDS = process.env.ADMIN_CHAT_IDS
  .split(",")
  .map(id => id.trim());

// Простая логика для коротких ответов
function normalizeUserMessage(text) {
  const t = text.trim().toLowerCase();

  if (t === "1") return "Я хочу записаться на приём.";
  if (t === "2") return "Я хочу узнать подробнее об услугах клиники.";
  if (t === "3") return "Я хочу узнать график работы клиники.";
  if (t === "4") return "У меня другой вопрос.";

  if (["да", "ага", "угу", "конечно"].includes(t)) {
    return "Да, меня это интересует.";
  }
  if (["нет", "не", "неа"].includes(t)) {
    return "Нет, это меня не интересует.";
  }

  return text;
}

// Храним состояние диалога в памяти
const userState = {};

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const raw = ctx.message.text;
  const userMessage = normalizeUserMessage(raw);

  // Инициализация состояния
  if (!userState[chatId]) {
    userState[chatId] = {
      context: [],
      waitingForPhone: false,
      waitingForName: false
    };
  }

  const state = userState[chatId];

  // Если бот ждёт телефон
  if (state.waitingForPhone) {
    const phone = raw.trim();

    if (!phone.match(/^\+?\d[\d\s\-]{5,}$/)) {
      return ctx.reply("Похоже, номер в необычном формате. Напишите, пожалуйста, номер телефона ещё раз.");
    }

    state.phone = phone;
    state.waitingForPhone = false;
    state.waitingForName = true;

    return ctx.reply("Спасибо! Напишите, пожалуйста, ваше имя.");
  }

  // Если бот ждёт имя
  if (state.waitingForName) {
    const name = raw.trim();
    state.name = name;
    state.waitingForName = false;

    // Формируем текст заявки
    const leadText = `
Новая заявка из бота:
Имя: ${state.name}
Телефон: ${state.phone}
Комментарий: ${state.context.join(" ")}
    `.trim();

    // Отправляем всем администраторам
    for (const adminId of ADMIN_CHAT_IDS) {
      await ctx.telegram.sendMessage(adminId, leadText);
    }

    // Очищаем состояние
    userState[chatId] = null;

    return ctx.reply("Спасибо! Я передал вашу заявку администратору. Мы свяжемся с вами в ближайшее время.");
  }

  // Запоминаем контекст
  state.context.push(raw);

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `
Ты — живой, дружелюбный администратор стоматологии «МедГарант».
Ты ведёшь диалог естественно, коротко и по делу.

Главная цель — довести человека до записи:
- если человек жалуется на боль — сочувствуй и предложи записаться;
- если человек интересуется услугами — уточняй, что именно;
- если человек готов записаться — спрашивай удобный день и время;
- после выбора времени — проси номер телефона;
- после телефона — проси имя;
- после имени — говори, что заявка передана администратору.

Не повторяй одни и те же фразы.
Не сбрасывай контекст.
Не давай медицинских рекомендаций.
          `.trim()
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      })
    });

    const data = await response.json();
    const reply =
      data?.choices?.[0]?.message?.content ??
      "Извините, сейчас не могу ответить.";

    // Если бот решил, что пора собирать телефон
    if (reply.toLowerCase().includes("номер телефона")) {
      state.waitingForPhone = true;
    }

    await ctx.reply(reply);
  } catch (err) {
    console.error("Ошибка:", err);
    await ctx.reply("Произошла ошибка. Попробуйте ещё раз.");
  }
});

bot.launch();

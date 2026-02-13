import { Telegraf } from "telegraf";
import fetch from "node-fetch";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Несколько администраторов через запятую
const ADMIN_CHAT_IDS = process.env.ADMIN_CHAT_IDS
  .split(",")
  .map(id => id.trim());

// Преобразование коротких ответов
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

// Состояние диалога
const userState = {};

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const raw = ctx.message.text.trim();
  const userMessage = normalizeUserMessage(raw);

  // Инициализация состояния
  if (!userState[chatId]) {
    userState[chatId] = {
      context: [],
      greeted: false,
      waitingForPhone: false,
      waitingForName: false,
      date: null,
      time: null,
      clarifyUsed: false
    };
  }

  const state = userState[chatId];

  // Если пользователь сам написал приветствие — считаем, что приветствие уже было
  const greetings = ["здравствуйте", "привет", "добрый день", "добрый вечер", "доброе утро"];
  if (greetings.includes(raw.toLowerCase())) {
    state.greeted = true;
  }

  // Первое приветствие — только один раз
  if (!state.greeted) {
    state.greeted = true;
    return ctx.reply("Здравствуйте! Вас приветствует стоматология «МедГарант». Подскажите, пожалуйста, что вас беспокоит.");
  }

  // Если ждём телефон
  if (state.waitingForPhone) {
    const phone = raw;

    if (!phone.match(/^\+?\d[\d\s\-]{5,}$/)) {
      return ctx.reply("Похоже, номер в необычном формате. Напишите, пожалуйста, номер телефона ещё раз.");
    }

    state.phone = phone;
    state.waitingForPhone = false;
    state.waitingForName = true;

    return ctx.reply("Спасибо! Напишите, пожалуйста, ваше имя полностью (ФИО).");
  }

  // Если ждём имя
  if (state.waitingForName) {
    const name = raw;
    state.name = name;
    state.waitingForName = false;

    const leadText = `
Новая заявка из бота:
Имя: ${state.name}
Телефон: ${state.phone}
Дата: ${state.date ?? "не указана"}
Время: ${state.time ?? "не указано"}
Комментарий: ${state.context.join(" ")}
    `.trim();

    for (const adminId of ADMIN_CHAT_IDS) {
      await ctx.telegram.sendMessage(adminId, leadText);
    }

    userState[chatId] = null;

    return ctx.reply("Спасибо! Я передал вашу заявку администратору. Мы свяжемся с вами в ближайшее время.");
  }

  // Попытка распознать дату и время
  const dateRegex = /\b(сегодня|завтра|\d{1,2}\.\d{1,2}|\d{1,2}\s+[а-я]+)\b/i;
  const timeRegex = /\b(\d{1,2}[:.]?\d{0,2}\s*(утра|вечера|дня)?|\bутром\b|\bднём\b|\bвечером\b)\b/i;

  const foundDate = raw.match(dateRegex);
  const foundTime = raw.match(timeRegex);

  if (foundDate && !state.date) {
    state.date = foundDate[0];
  }

  if (foundTime && !state.time) {
    state.time = foundTime[0];
  }

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
Ты — вежливый администратор стоматологии «МедГарант».
Ты НЕ врач. Не давай медицинских рекомендаций, не используй списки, не задавай много уточнений.

Твоя задача:
— задать ОДИН короткий уточняющий вопрос,
— затем культурно пригласить на первичный приём и рассказать про акцию.

Уточняющий вопрос (строго один):
«Понимаю. А боль постоянная или появляется при накусывании.»

После этого обязательно напиши по смыслу так:

«Понимаю ситуацию. Чтобы врач точно оценил, что происходит, лучше прийти на первичный приём.
Сейчас действует акция: полный стоматологический check‑up — 3500 руб. вместо 4900 руб.
В стоимость входит консультация любого врача‑стоматолога и компьютерная 3D‑диагностика (КЛКТ).
Подскажите, когда вам удобнее — сегодня, завтра или в другой день?»

Не используй:
— списки (1., 2., •, -)
— врачебные термины
— длинные расспросы
— повторные приветствия.
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
    let reply =
      data?.choices?.[0]?.message?.content ??
      "Извините, сейчас не могу ответить.";

    // Фильтр приветствий
    reply = reply
      .replace(/^здравствуйте[!. ]*/i, "")
      .replace(/^добрый день[!. ]*/i, "")
      .replace(/^добрый вечер[!. ]*/i, "")
      .replace(/^доброе утро[!. ]*/i, "")
      .replace(/вас приветствует стоматология «?медгарант»?/gi, "")
      .trim();

    // Фильтр списков
    reply = reply
      .replace(/^\s*\d+\.\s*/gm, "")
      .replace(/^\s*\d+\)\s*/gm, "")
      .replace(/^\s*[-•]\s*/gm, "")
      .trim();

    // Определение уточнения
    const clarifyTriggers = [
      /подробнее/i,
      /расскажите/i,
      /опишите/i,
      /что именно/i,
      /какой зуб/i,
      /это может быть/i,
      /чтобы подобрать/i,
      /характер/i,
      /симптом/i
    ];

    const isClarify =
      clarifyTriggers.some(p => reply.match(p)) ||
      reply.includes("?");

    // Если уточнение уже было — заменяем на приглашение
    if (isClarify && state.clarifyUsed) {
      reply =
        "Понимаю ситуацию. Чтобы врач точно оценил, что происходит, лучше прийти на первичный приём.\n\n" +
        "Сейчас действует акция: полный стоматологический check‑up — 3500 руб. вместо 4900 руб.\n" +
        "В стоимость входит консультация любого врача‑стоматолога и компьютерная 3D‑диагностика (КЛКТ).\n\n" +
        "Подскажите, когда вам удобнее — сегодня, завтра или в другой день?";
    }

    // Если это первое уточнение — помечаем
    if (isClarify && !state.clarifyUsed) {
      state.clarifyUsed = true;
      reply = "Понимаю. А боль постоянная или появляется при накусывании.";
    }

    // Если пора собирать телефон
    if (
      reply.toLowerCase().includes("номер телефона") ||
      (state.date && state.time && !state.phone)
    ) {
      state.waitingForPhone = true;
    }

    await ctx.reply(reply);
  } catch (err) {
    console.error("Ошибка:", err);
    await ctx.reply("Произошла ошибка. Попробуйте ещё раз.");
  }
});

bot.launch();

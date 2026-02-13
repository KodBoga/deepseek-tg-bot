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
      clarifyCount: 0
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
    return ctx.reply("Здравствуйте! Вас приветствует стоматология «МедГарант». Подскажите, пожалуйста, что вас беспокоит?");
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
Ты НЕ врач. Не давай медицинских рекомендаций, не устраивай клинический опрос, не используй списки 1., 2., 3. и сложную структуру.

Твоя задача:
— максимум ОДИН короткий уточняющий вопрос в человеческом стиле,
— затем приглашение на первичный приём и рассказ про акцию.

Примеры уточнения:
— «Понимаю. А какой именно зуб даёт о себе знать — спереди или сбоку?»

После этого обязательно напиши по смыслу так:

«Понимаю, что ситуация может быть неприятной. Чтобы врач точно оценил, что происходит, лучше прийти на первичный приём.
Сейчас действует акция: полный стоматологический check‑up — 3500 руб. вместо 4900 руб.
В стоимость входит консультация любого врача‑стоматолога и компьютерная 3D‑диагностика (КЛКТ).
Подскажите, когда вам удобнее — сегодня, завтра или в другой день?»

Не используй:
— нумерованные списки (1., 2., 3.)
— маркеры •, -
— длинные блоки с вопросами
— клинические термины
— повторные приветствия.
            `.trim()
          },
          {
            role: "user",
            content: userMessage
          },
          {
            role: "assistant",
            content: `
Текущие данные:
Дата: ${state.date ?? "не указана"}
Время: ${state.time ?? "не указано"}
Уточнений: ${state.clarifyCount}
            `.trim()
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
      .replace(/здравствуйте[!. ]*/gi, "")
      .replace(/добрый день[!. ]*/gi, "")
      .replace(/добрый вечер[!. ]*/gi, "")
      .replace(/доброе утро[!. ]*/gi, "")
      .trim();

    // Фильтр нумерации и списков
    reply = reply
      .replace(/^\s*\d+\.\s*/gm, "")
      .replace(/^\s*\d+\)\s*/gm, "")
      .replace(/^\s*[-•]\s*/gm, "")
      .trim();

    // Определение уточняющего вопроса:
    // 1) Любой вопрос с "что/какой/какая/какие/где/когда/как/почему" + ?
    // 2) Любые врачебные формулировки
    const questionWordPattern = /(что|какой|какая|какие|где|когда|как|почему)/i;
    const isQuestion = reply.includes("?");
    const medicalPatterns = [
      /что именно/i,
      /что беспокоит/i,
      /что происходит/i,
      /опишите/i,
      /расскажите/i,
      /симптом/i,
      /характер боли/i,
      /реагирует/i,
      /усиливается/i,
      /при накусывании/i,
      /кариес/i,
      /пломб[аы]/i,
      /коронк[аи]/i,
      /чувствительность/i
    ];

    let isClarify = false;
    if (isQuestion && questionWordPattern.test(reply)) {
      isClarify = true;
    }
    if (medicalPatterns.some(p => reply.match(p))) {
      isClarify = true;
    }

    if (isClarify) {
      state.clarifyCount++;
    }

    // Если уточнение не первое — сразу переводим на приём + акция
    if (state.clarifyCount >= 1) {
      reply =
        "Понимаю, что ситуация может быть неприятной. Чтобы врач точно оценил, что происходит, лучше прийти на первичный приём.\n\n" +
        "Сейчас действует акция: полный стоматологический check‑up — 3500 руб. вместо 4900 руб.\n" +
        "В стоимость входит консультация любого врача‑стоматолога и компьютерная 3D‑диагностика (КЛКТ).\n\n" +
        "Подскажите, когда вам удобнее — сегодня, завтра или в другой день?";
      state.clarifyCount = 0;
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

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
      time: null
    };
  }

  const state = userState[chatId];

  // Если пользователь сам написал приветствие — считаем, что приветствие уже было
  const greetings = ["здравствуйте", "привет", "добрый день", "добрый вечер", "доброе утро"];
  if (greetings.includes(raw.toLowerCase())) {
    state.greeted = true;
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

    // Формируем заявку
    const leadText = `
Новая заявка из бота:
Имя: ${state.name}
Телефон: ${state.phone}
Дата: ${state.date ?? "не указана"}
Время: ${state.time ?? "не указано"}
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
Ты — вежливый и профессиональный администратор стоматологии «МедГарант».
Твоя задача — вести диалог с клиентом, помогать ему и собирать данные для записи.

ПРИВЕТСТВИЕ:
— Приветствуй пользователя только один раз за весь диалог.
— Если пользователь сам написал «здравствуйте», «привет», «добрый день», «добрый вечер», «доброе утро» — ответь на приветствие, но только один раз.
— Если приветствие уже было, НИКОГДА не начинай ответ с приветствия.
— Если модель случайно вставила приветствие — это ошибка, его нужно убрать.

ОБЩИЕ ПРАВИЛА:
1. Никогда не придумывай данные, которые клиент не говорил. Особенно дату, время, имя, телефон.
2. Не будь фамильярным. Используй нейтрально‑вежливый стиль.
3. Не назначай точное время приёма. Клиент указывает только примерный диапазон.
4. Не переходи к запросу телефона, пока не уточнены проблема, дата и время.
5. Если клиент спрашивает цену — не называй стоимость лечения. Предлагай акцию.

АКЦИЯ:
«Стоимость зависит от конкретной ситуации. Чтобы врач точно сказал цену, лучше прийти на первичный приём.
Сейчас действует акция: Полный стоматологический check‑up — 3500 руб. вместо 4900 руб.
В стоимость входит консультация любого врача‑стоматолога и компьютерная 3D‑диагностика (КЛКТ).»

ЛОГИКА:
1. Приветствие (один раз).
2. Уточнение проблемы.
3. Уточнение примерной даты.
4. Уточнение примерного времени.
5. Запрос телефона.
6. Запрос имени.
7. Завершение.
            `.trim()
          },
          {
            role: "user",
            content: userMessage
          },
          {
            role: "assistant",
            content: `
Текущие данные пользователя:
Дата: ${state.date ?? "не указана"}
Время: ${state.time ?? "не указано"}
            `.trim()
          }
        ]
      })
    });

    const data = await response.json();
    let reply =
      data?.choices?.[0]?.message?.content ??
      "Извините, сейчас не могу ответить.";

    // Фильтр повторных приветствий
    if (state.greeted) {
      reply = reply
        .replace(/^здравствуйте[!. ]*/i, "")
        .replace(/^добрый день[!. ]*/i, "")
        .replace(/^добрый вечер[!. ]*/i, "")
        .replace(/^доброе утро[!. ]*/i, "")
        .trim();
    }

    // Если DeepSeek всё же вставил приветствие — помечаем
    if (!state.greeted && reply.toLowerCase().includes("здрав")) {
      state.greeted = true;
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

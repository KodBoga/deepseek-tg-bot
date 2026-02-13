import { Telegraf } from "telegraf";

// Используем переменную, которая реально есть в Railway
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Несколько администраторов через запятую
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

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
      clarifyUsed: false,
      invited: false,
      phone: null,
      name: null
    };
  }

  const state = userState[chatId];

  // Если пользователь сам написал приветствие
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

  // 1) Уточняющий вопрос
  if (!state.clarifyUsed) {
    state.clarifyUsed = true;
    return ctx.reply("Понимаю. А боль постоянная или появляется при накусывании.");
  }

  // 2) Приглашение на приём
  if (state.clarifyUsed && !state.invited) {
    state.invited = true;
    return ctx.reply(
      "Понимаю ситуацию. Чтобы врач точно оценил, что происходит, лучше прийти на первичный приём.\n\n" +
      "Сейчас действует акция: полный стоматологический check‑up — 3500 руб. вместо 4900 руб.\n" +
      "В стоимость входит консультация любого врача‑стоматолога и компьютерная 3D‑диагностика (КЛКТ).\n\n" +
      "Подскажите, когда вам удобнее — сегодня, завтра или в другой день?"
    );
  }

  // 3) Просим телефон
  if (state.invited && !state.phone && !state.waitingForPhone && !state.waitingForName) {
    state.waitingForPhone = true;
    return ctx.reply("Чтобы записать вас на приём, напишите, пожалуйста, номер телефона для связи.");
  }

  // 4) Фолбэк
  return ctx.reply("Понимаю вас. Давайте я помогу с записью: напишите, пожалуйста, номер телефона для связи.");
});

bot.launch();

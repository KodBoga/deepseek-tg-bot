import { Telegraf, Markup } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

const userState = {};

const clarifyMap = [
  {
    keys: ["десна", "дёсна", "десны", "опухла"],
    question: "А что именно с десной? Кровоточит, опухла, болит, есть неприятный запах?"
  },
  {
    keys: ["кровоточ", "кровь"],
    question: "Кровоточит при чистке, при еде или сама по себе?"
  },
  {
    keys: ["камн", "налет", "налёт"],
    question: "Налёт и камни больше беспокоят визуально или есть неприятные ощущения, запах?"
  },
  {
    keys: ["запах"],
    question: "Запах появился недавно или давно? Усиливается утром или после еды?"
  },
  {
    keys: ["скол"],
    question: "Скол большой или небольшой? Есть ли боль при накусывании или на холодное?"
  }
];

bot.start((ctx) => {
  const chatId = ctx.chat.id;

  userState[chatId] = {
    context: [],
    waitingForPhone: false,
    waitingForName: false,
    clarifyUsed: false,
    invited: false,
    phone: null,
    name: null,
    date: null,
    time: null
  };

  ctx.reply(
    "Здравствуйте! Вас приветствует стоматология «МедГарант». Подскажите, пожалуйста, какая услуга вас интересует.",
    Markup.keyboard([
      ["Чистка зубов", "Отбеливание", "Имплантация"],
      ["Лечение кариеса", "Протезирование", "Виниры"],
      ["Ортодонтия", "Удаление зубов", "Диагностика КЛКТ"],
      ["Цены", "Акции", "График работы"]
    ]).resize()
  );
});

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const raw = ctx.message.text.trim();
  const text = raw.toLowerCase();
  const state = (userState[chatId] ||= {
    context: [],
    waitingForPhone: false,
    waitingForName: false,
    clarifyUsed: false,
    invited: false,
    phone: null,
    name: null,
    date: null,
    time: null
  });

  // Ожидание телефона
  if (state.waitingForPhone) {
    if (!raw.match(/^\+?\d[\d\s\-]{5,}$/)) {
      return ctx.reply("Похоже, номер в необычном формате. Напишите, пожалуйста, номер телефона ещё раз.");
    }

    state.phone = raw;
    state.waitingForPhone = false;
    state.waitingForName = true;

    return ctx.reply("Спасибо! Напишите, пожалуйста, ваше имя полностью (ФИО).");
  }

  // Ожидание имени
  if (state.waitingForName) {
    state.name = raw;
    state.waitingForName = false;

    const lead = {
      name: state.name,
      phone: state.phone,
      date: state.date ?? "не указана",
      time: state.time ?? "не указано",
      comment: state.context.join(" ")
    };

    for (const adminId of ADMIN_CHAT_IDS) {
      await ctx.telegram.sendMessage(
        adminId,
        `
Новая заявка из бота:
Имя: ${lead.name}
Телефон: ${lead.phone}
Дата: ${lead.date}
Время: ${lead.time}
Комментарий: ${lead.comment}
        `.trim()
      );
    }

    userState[chatId] = null;

    return ctx.reply("Спасибо! Я передал вашу заявку администратору. Мы свяжемся с вами в ближайшее время.");
  }

  // Пытаемся вытащить дату/время
  const dateRegex = /\b(сегодня|завтра|\d{1,2}\.\d{1,2})\b/i;
  const timeRegex = /\b(\d{1,2}[:.]?\d{0,2})\b/i;

  const foundDate = raw.match(dateRegex);
  const foundTime = raw.match(timeRegex);

  if (foundDate) state.date = foundDate[0];
  if (foundTime) state.time = foundTime[0];

  state.context.push(raw);

  // Контекстный уточняющий вопрос (один раз)
  if (!state.clarifyUsed) {
    for (const item of clarifyMap) {
      if (item.keys.some(k => text.includes(k))) {
        state.clarifyUsed = true;
        return ctx.reply(item.question);
      }
    }

    state.clarifyUsed = true;
    return ctx.reply("Понимаю. Расскажите, пожалуйста, чуть подробнее, что именно вас интересует.");
  }

  // Приглашение на приём + акция (один раз)
  if (!state.invited) {
    state.invited = true;
    return ctx.reply(
      "Понимаю. Чтобы врач точно оценил ситуацию, лучше прийти на первичный приём.\n\n" +
      "Сейчас действует акция: полный стоматологический check‑up — 3500 руб. вместо 4900 руб.\n" +
      "В стоимость входит консультация любого врача‑стоматолога и компьютерная 3D‑диагностика (КЛКТ).\n\n" +
      "Когда вам удобнее — сегодня, завтра или в другой день?"
    );
  }

  // Если ещё нет телефона — просим телефон
  if (!state.phone) {
    state.waitingForPhone = true;
    return ctx.reply("Чтобы записать вас на приём, напишите, пожалуйста, номер телефона для связи.");
  }

  return ctx.reply("Я зафиксировал информацию. Администратор свяжется с вами для уточнения деталей.");
});

bot.launch();

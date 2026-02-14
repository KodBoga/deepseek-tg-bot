import { Telegraf, Markup } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

const userState = {};

const branches = {
  "СПб, ул. Бадаева, д. 6, корп.1":
    "СПб, ул. Бадаева, д. 6, корп.1\nм. Проспект Большевиков\n+7 (812) 240‑12‑22\n9:00—21:00 (ежедневно)",
  "СПб, ул. Туристская, д. 10, корп. 1":
    "СПб, ул. Туристская, д. 10, корп. 1\nм. Беговая\n+7 (812) 240‑12‑22\n9:00—21:00 (ежедневно)",
  "СПб, Петровский проспект, д. 5":
    "СПб, Петровский проспект, д. 5\nм. Спортивная\n+7 (812) 240‑12‑22\n9:00—21:00 (ежедневно)",
  "СПб, ул. Киевская, д. 3А":
    "СПб, ул. Киевская, д. 3А\nм. Фрунзенская\n+7 (812) 240‑12‑22\n9:00—21:00 (ежедневно)",
  "г. Мурино, б-р Менделеева, д. 9, корп.1":
    "г. Мурино, б-р Менделеева, д. 9, корп.1\nм. Девяткино\n+7 (812) 240‑12‑22\n9:00—21:00 (ежедневно)"
};

function mainMenu() {
  return Markup.keyboard([
    ["Зуб", "Десна"],
    ["Брекеты", "Гигиена"],
    ["Хочу консультацию"],
    ["График работы"]
  ]).resize();
}

function branchesMenu() {
  return Markup.keyboard([
    ["СПб, ул. Бадаева, д. 6, корп.1"],
    ["СПб, ул. Туристская, д. 10, корп. 1"],
    ["СПб, Петровский проспект, д. 5"],
    ["СПб, ул. Киевская, д. 3А"],
    ["г. Мурино, б-р Менделеева, д. 9, корп.1"],
    ["Назад"]
  ]).resize();
}

bot.start((ctx) => {
  const chatId = ctx.chat.id;

  userState[chatId] = {
    context: [],
    waitingForPhone: false,
    waitingForName: false,
    invited: false,
    phone: null,
    name: null,
    date: null,
    time: null
  };

  ctx.reply(
    "Здравствуйте! Вас приветствует стоматология «МедГарант». Подскажите, пожалуйста, что вас интересует.",
    mainMenu()
  );
});

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const raw = ctx.message.text.trim();
  const text = raw.toLowerCase();
  const state = userState[chatId];

  // Назад
  if (raw === "Назад") {
    return ctx.reply("Возвращаюсь в главное меню.", mainMenu());
  }

  // График работы → показать филиалы
  if (raw === "График работы") {
    return ctx.reply("Выберите филиал:", branchesMenu());
  }

  // Если выбрали филиал
  if (branches[raw]) {
    return ctx.reply(branches[raw]);
  }

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

  // Приглашение на приём
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



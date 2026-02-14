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
    [
      "СПб, ул. Бадаева, д. 6, корп.1",
      "СПб, ул. Туристская, д. 10, корп. 1"
    ],
    [
      "СПб, Петровский проспект, д. 5",
      "СПб, ул. Киевская, д. 3А"
    ],
    [
      "г. Мурино, б-р Менделеева, д. 9, корп.1",
      "Назад"
    ]
  ]).resize();
}

function createState() {
  return {
    section: null,
    context: [],
    waitingForPhone: false,
    waitingForName: false,
    invited: false,
    phone: null,
    name: null,
    date: null,
    time: null
  };
}

function resetState(state) {
  state.waitingForPhone = false;
  state.waitingForName = false;
  state.invited = false;
  state.context = [];
  state.date = null;
  state.time = null;
}

bot.start((ctx) => {
  const chatId = ctx.chat.id;
  userState[chatId] = createState();

  ctx.reply(
    "Здравствуйте! Вас приветствует стоматология «МедГарант». Подскажите, пожалуйста, что вас интересует.",
    mainMenu()
  );
});

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const raw = ctx.message.text.trim();

  // Если state отсутствует — создаём новый
  if (!userState[chatId]) {
    userState[chatId] = createState();
  }

  const state = userState[chatId];

  // Назад
  if (raw === "Назад") {
    resetState(state);
    state.section = null;
    return ctx.reply("Возвращаюсь в главное меню.", mainMenu());
  }

  // График работы
  if (raw === "График работы") {
    resetState(state);
    state.section = "branches";
    return ctx.reply("Выберите филиал:", branchesMenu());
  }

  // Выбор филиала
  if (state.section === "branches" && branches[raw]) {
    return ctx.reply(branches[raw]);
  }

  // Главное меню
  if (["Зуб", "Десна", "Брекеты", "Гигиена", "Хочу консультацию"].includes(raw)) {
    resetState(state);
    state.section = raw;

    if (raw === "Зуб")
      return ctx.reply("Что именно беспокоит зуб? Боль, чувствительность, скол, кариес?");

    if (raw === "Десна")
      return ctx.reply("Что именно с десной? Кровоточит, опухла, болит, запах?");

    if (raw === "Брекеты")
      return ctx.reply("Интересует установка брекетов, консультация ортодонта или стоимость?");

    if (raw === "Гигиена")
      return ctx.reply("Гигиена: интересует профчистка, AirFlow, удаление камней?");

    if (raw === "Хочу консультацию") {
      state.section = "consultation";
      return ctx.reply("Хорошо, подскажите, по какому вопросу нужна консультация?");
    }
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

    delete userState[chatId];

    return ctx.reply("Спасибо! Я передал вашу заявку администратору. Мы свяжемся с вами в ближайшее время.");
  }

  // Консультация
  if (state.section === "consultation") {
    state.context.push(raw);

    if (!state.invited) {
      state.invited = true;
      return ctx.reply(
        "Понимаю. Чтобы врач точно оценил ситуацию, лучше прийти на первичный приём.\n\n" +
        "Сейчас действует акция: полный стоматологический check‑up — 3500 руб. вместо 4900 руб.\n" +
        "В стоимость входит консультация любого врача‑стоматолога и компьютерная 3D‑диагностика (КЛКТ).\n\n" +
        "Когда вам удобнее — сегодня, завтра или в другой день?"
      );
    }
  }

  // Сбор контекста
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

  // Просим телефон
  if (!state.phone) {
    state.waitingForPhone = true;
    return ctx.reply("Чтобы записать вас на приём, напишите, пожалуйста, номер телефона для связи.");
  }

  return ctx.reply("Я зафиксировал информацию. Администратор свяжется с вами для уточнения деталей.");
});

bot.launch();



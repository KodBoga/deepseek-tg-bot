import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import path from "path";

// --- НАСТРОЙКИ ---

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

// --- ФАЙЛ ДЛЯ ЛОГОВ ---

const DATA_DIR = path.resolve("data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(LEADS_FILE)) {
  fs.writeFileSync(LEADS_FILE, "[]", "utf-8");
}

function loadLeads() {
  try {
    const raw = fs.readFileSync(LEADS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error reading leads.json:", e.message);
    return [];
  }
}

function saveLeads(leads) {
  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing leads.json:", e.message);
  }
}

let leads = loadLeads();

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function upsertLead({ tg_id, username, first_name, last_name, chat_id, status, phone, name, context }) {
  const now = new Date().toISOString();
  let v = leads.find(x => x.tg_id === tg_id);

  if (!v) {
    v = {
      tg_id,
      username: username || "",
      first_name: first_name || "",
      last_name: last_name || "",
      chat_id,
      status: status || "visit",
      phone: phone || "",
      name: name || "",
      context: context || "",
      createdAt: now,
      updatedAt: now
    };
    leads.push(v);
  } else {
    v.username = username || v.username;
    v.first_name = first_name || v.first_name;
    v.last_name = last_name || v.last_name;
    v.chat_id = chat_id || v.chat_id;
    if (status) v.status = status;
    if (phone) v.phone = phone;
    if (name) v.name = name;
    if (context) v.context = context;
    v.updatedAt = now;
  }

  saveLeads(leads);
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPeriodRange(option) {
  const now = new Date();
  let from, to;

  if (option === "Сегодня") {
    from = formatDate(now);
    to = formatDate(now);
  } else if (option === "Вчера") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    from = formatDate(d);
    to = formatDate(d);
  } else if (option === "Последние 7 дней") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    from = formatDate(d);
    to = formatDate(now);
  } else if (option === "Последние 30 дней") {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    from = formatDate(d);
    to = formatDate(now);
  }

  return { from, to };
}

function isAdmin(chatId) {
  return ADMIN_CHAT_IDS.includes(String(chatId));
}

// --- СТАТИКА ---

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

function adminMenu() {
  return Markup.keyboard([
    ["📊 Выгрузить CSV"],
    ["Назад"]
  ]).resize();
}

function createState() {
  return {
    section: null,
    context: [],
    invited: false,
    waitingForPhone: false,
    waitingForName: false,
    phone: null,
    name: null,
    isAdmin: false,
    waitingCsvPeriod: false
  };
}

function resetState(state) {
  state.section = null;
  state.context = [];
  state.invited = false;
  state.waitingForPhone = false;
  state.waitingForName = false;
  state.phone = null;
  state.name = null;
  state.waitingCsvPeriod = false;
}

// --- START ---

bot.start((ctx) => {
  const chatId = ctx.chat.id;
  const from = ctx.from;

  userState[chatId] = createState();
  const state = userState[chatId];
  state.isAdmin = isAdmin(chatId);

  upsertLead({
    tg_id: from.id,
    username: from.username,
    first_name: from.first_name,
    last_name: from.last_name,
    chat_id: chatId,
    status: "visit"
  });

  ctx.reply(
    "Здравствуйте! Вас приветствует стоматология «МедГарант». Подскажите, пожалуйста, что вас интересует.",
    mainMenu()
  );
});

// --- ОСНОВНАЯ ЛОГИКА ---

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const raw = ctx.message.text.trim();
  const from = ctx.from;

  if (!userState[chatId]) userState[chatId] = createState();
  const state = userState[chatId];
  if (isAdmin(chatId)) state.isAdmin = true;

  // АДМИН: вход в меню
  if (raw === "/admin" && state.isAdmin) {
    resetState(state);
    state.isAdmin = true;
    return ctx.reply("Админ‑меню:", adminMenu());
  }

  // Назад
  if (raw === "Назад") {
    resetState(state);
    return ctx.reply("Возвращаюсь в главное меню.", mainMenu());
  }

  // --- АДМИН: ВЫГРУЗКА CSV ---

  if (state.isAdmin && raw === "📊 Выгрузить CSV") {
    state.waitingCsvPeriod = true;
    return ctx.reply(
      "За какой период выгрузить CSV?",
      Markup.keyboard([
        ["Сегодня", "Вчера"],
        ["Последние 7 дней", "Последние 30 дней"],
        ["Назад"]
      ]).resize()
    );
  }

  if (state.isAdmin && state.waitingCsvPeriod) {
    const allowed = ["Сегодня", "Вчера", "Последние 7 дней", "Последние 30 дней"];
    if (!allowed.includes(raw)) {
      if (raw === "Назад") {
        state.waitingCsvPeriod = false;
        return ctx.reply("Админ‑меню:", adminMenu());
      }
      return ctx.reply("Выберите период с кнопок.");
    }

    const { from: fromDate, to: toDate } = getPeriodRange(raw);
    const fromTs = new Date(fromDate + "T00:00:00Z").getTime();
    const toTs = new Date(toDate + "T23:59:59Z").getTime();

    const rows = leads.filter(v => {
      const t = new Date(v.createdAt).getTime();
      return t >= fromTs && t <= toTs;
    });

    // --- CSV #1: all.csv ---
    const headerAll = [
      "tg_id","username","first_name","last_name","chat_id",
      "status","phone","name","context","createdAt","updatedAt"
    ];

    const csvAll = [
      headerAll.join(";"),
      ...rows.map(v => [
        v.tg_id, v.username, v.first_name, v.last_name, v.chat_id,
        v.status, v.phone, v.name,
        (v.context || "").replace(/\r?\n/g, " "),
        v.createdAt, v.updatedAt
      ].map(x => String(x).replace(/;/g, ",")).join(";"))
    ].join("\n");

    const csvAllWithBom = "\uFEFF" + csvAll;

    await ctx.replyWithDocument(
      { source: Buffer.from(csvAllWithBom, "utf-8"), filename: `all_${fromDate}_${toDate}.csv` }
    );

    // --- CSV #2: leads.csv ---
    const leadsOnly = rows.filter(v => v.status === "lead");

    const headerLeads = ["name","phone","context","createdAt"];

    const csvLeads = [
      headerLeads.join(";"),
      ...leadsOnly.map(v => [
        v.name, v.phone,
        (v.context || "").replace(/\r?\n/g, " "),
        v.createdAt
      ].map(x => String(x).replace(/;/g, ",")).join(";"))
    ].join("\n");

    const csvLeadsWithBom = "\uFEFF" + csvLeads;

    await ctx.replyWithDocument(
      { source: Buffer.from(csvLeadsWithBom, "utf-8"), filename: `leads_${fromDate}_${toDate}.csv` }
    );

    state.waitingCsvPeriod = false;
    return;
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

  // Кнопка "🟣 Акция Check‑Up 🟣"
  if (raw === "🟣 Акция Check‑Up 🟣") {
    return ctx.replyWithPhoto(
      {
        url: "https://avatars.mds.yandex.net/get-sprav-posts/19677858/2a0000019c4b7865802b28005b2a12f07abb/XL"
      },
      {
        caption:
          "🔥 АКЦИЯ\n\n" +
          "Полный стоматологический check‑up — 3500 руб. вместо 4900 руб.\n" +
          "В стоимость входит консультация и 3D‑диагностика.\n\n" +
          "Когда вам удобнее записаться?",
        reply_markup: {
          keyboard: [
            ["Сегодня", "Завтра", "Другой день"],
            ["Назад"]
          ],
          resize_keyboard: true
        }
      }
    );
  }

  // Выбор дня
  if (["Сегодня", "Завтра", "Другой день"].includes(raw)) {
    state.context.push("Выбор дня: " + raw);
    state.waitingForPhone = true;
    return ctx.reply("Чтобы записать вас на приём, напишите, пожалуйста, номер телефона для связи.");
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
      comment: state.context.join(" ")
    };

    upsertLead({
      tg_id: from.id,
      username: from.username,
      first_name: from.first_name,
      last_name: from.last_name,
      chat_id: chatId,
      status: "lead",
      phone: lead.phone,
      name: lead.name,
      context: lead.comment
    });

    for (const adminId of ADMIN_CHAT_IDS) {
      await ctx.telegram.sendMessage(
        adminId,
        `
Новая заявка из бота:
Имя: ${lead.name}
Телефон: ${lead.phone}
Комментарий: ${lead.comment}
        `.trim()
      );
    }

    delete userState[chatId];

    return ctx.reply("Спасибо! Я передал вашу заявку администратору. Мы свяжемся с вами в ближайшее время.");
  }

  if (state.section === "consultation") {
    state.context.push(raw);
  }

  state.context.push(raw);

  if (!state.invited) {
    state.invited = true;

    return ctx.reply(
      "Понимаю. Чтобы врач точно оценил ситуацию, лучше прийти на первичный приём.\n\n" +
      "Сейчас действует акция на полный стоматологический check‑up.\n" +
      "Когда вам удобнее — сегодня, завтра или в другой день?",
      Markup.keyboard([
        ["Сегодня", "Завтра", "Другой день"],
        ["🟣 Акция Check‑Up 🟣"],
        ["Назад"]
      ]).resize()
    );
  }

  upsertLead({
    tg_id: from.id,
    username: from.username,
    first_name: from.first_name,
    last_name: from.last_name,
    chat_id: chatId,
    status: "no_phone",
    context: state.context.join(" ")
  });

  state.waitingForPhone = true;
  return ctx.reply("Чтобы записать вас на приём, напишите, пожалуйста, номер телефона для связи.");
});

// --- ЗАПУСК БОТА ---

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import path from "path";

// --- НАСТРОЙКИ ---

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

// --- ФАЙЛЫ ---

const DATA_DIR = path.resolve("data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const INVITES_FILE = path.join(DATA_DIR, "invites.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, "[]", "utf-8");
if (!fs.existsSync(INVITES_FILE)) fs.writeFileSync(INVITES_FILE, "[]", "utf-8");

function loadLeads() {
  try { return JSON.parse(fs.readFileSync(LEADS_FILE, "utf-8")); }
  catch { return []; }
}

function saveLeads(leads) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), "utf-8");
}

let leads = loadLeads();

// --- INVITES ---

function loadInvites() {
  try { return JSON.parse(fs.readFileSync(INVITES_FILE, "utf-8")); }
  catch { return []; }
}

function saveInvites(data) {
  fs.writeFileSync(INVITES_FILE, JSON.stringify(data, null, 2), "utf-8");
}

let invites = loadInvites();

function hasBeenInvited(userId) {
  return invites.some(x => x.userId === userId);
}

function logInvite(userId) {
  invites.push({
    userId,
    invitedAt: new Date().toISOString()
  });
  saveInvites(invites);
}

// --- CRON: проверка неактивных пользователей каждые 10 сек ---

setInterval(async () => {
  const now = Date.now();

  for (const lead of leads) {
    if (!lead.lastActivityAt) continue;
    if (hasBeenInvited(lead.tg_id)) continue;

    const last = new Date(lead.lastActivityAt).getTime();

    if (now - last > 60 * 1000) {
      try {
        await bot.telegram.sendMessage(
          lead.chat_id,
          "Будем рады видеть вас в нашем Telegram‑канале 😊",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Наш Telegram - канал. Здесь выгодно!",
                    url: "https://t.me/medgarantspb?utm_source=bot&utm_medium=cron&utm_campaign=60sec"
                  }
                ]
              ]
            }
          }
        );

        logInvite(lead.tg_id);
      } catch (e) {
        console.error("Ошибка CRON‑приглашения:", e.message);
      }
    }
  }
}, 10 * 1000);
// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

function upsertLead({
  tg_id,
  username,
  first_name,
  last_name,
  chat_id,
  status,
  phone,
  name,
  context
}) {
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
      lastActivityAt: now,
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
    v.lastActivityAt = now;
    v.updatedAt = now;
  }

  saveLeads(leads);
}

function isAdmin(chatId) {
  return ADMIN_CHAT_IDS.includes(String(chatId));
}

const userState = {};

const branches = {
  "СПб, ул. Бадаева, д. 6, корп.1":
    "СПб, ул. Бадаева, д. 6, корп.1\nм. Проспект Большевиков\n9:00—21:00 (ежедневно)\n<a href=\"tel:+78122401222\">+7 (812) 240‑12‑22</a>",
  "СПб, ул. Туристская, д. 10, корп. 1":
    "СПб, ул. Туристская, д. 10, корп. 1\nм. Беговая\n9:00—21:00 (ежедневно)\n<a href=\"tel:+78122401222\">+7 (812) 240‑12‑22</a>",
  "СПб, Петровский проспект, д. 5":
    "СПб, Петровский проспект, д. 5\nм. Спортивная\n9:00—21:00 (ежедневно)\n<a href=\"tel:+78122401222\">+7 (812) 240‑12‑22</a>",
  "СПб, ул. Киевская, д. 3А":
    "СПб, ул. Киевская, д. 3А\nм. Фрунзенская\n9:00—21:00 (ежедневно)\n<a href=\"tel:+78122401222\">+7 (812) 240‑12‑22</a>",
  "г. Мурино, б-р Менделеева, д. 9, корп.1":
    "г. Мурино, б-р Менделеева, д. 9, корп.1\nм. Девяткино\n9:00—21:00 (ежедневно)\n<a href=\"tel:+78122401222\">+7 (812) 240‑12‑22</a>"
};

function mainMenu() {
  return Markup.keyboard([
    ["Зуб", "Имплантация"],
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
    ["📁 Управление логами"],
    ["Назад"]
  ]).resize();
}

function logsMenu() {
  return Markup.keyboard([
    ["📥 Скачать invites.json"],
    ["🧹 Очистить логи"],
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

  // обновляем активность пользователя
  upsertLead({
    tg_id: from.id,
    username: from.username,
    first_name: from.first_name,
    last_name: from.last_name,
    chat_id: chatId,
    status: "active"
  });

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

  // --- АДМИН: УПРАВЛЕНИЕ ЛОГАМИ ---

  if (state.isAdmin && raw === "📁 Управление логами") {
    return ctx.reply("Управление логами:", logsMenu());
  }

  if (state.isAdmin && raw === "📥 Скачать invites.json") {
    try {
      return await ctx.replyWithDocument({
        source: INVITES_FILE,
        filename: "invites.json"
      });
    } catch {
      return ctx.reply("Не удалось отправить файл invites.json");
    }
  }

  if (state.isAdmin && raw === "🧹 Очистить логи") {
    const backupName = `invites_backup_${Date.now()}.json`;
    const backupPath = path.join(DATA_DIR, backupName);

    try {
      fs.copyFileSync(INVITES_FILE, backupPath);
      invites = [];
      saveInvites(invites);
      return ctx.reply(`Логи очищены.\nРезервная копия: ${backupName}`);
    } catch {
      return ctx.reply("Не удалось очистить логи.");
    }
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

    const now = new Date();
    function formatDate(d) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }

    let fromDate, toDate;

    if (raw === "Сегодня") {
      fromDate = toDate = formatDate(now);
    } else if (raw === "Вчера") {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      fromDate = toDate = formatDate(d);
    } else if (raw === "Последние 7 дней") {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      fromDate = formatDate(d);
      toDate = formatDate(now);
    } else if (raw === "Последние 30 дней") {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      fromDate = formatDate(d);
      toDate = formatDate(now);
    }

    const fromTs = new Date(fromDate + "T00:00:00Z").getTime();
    const toTs = new Date(toDate + "T23:59:59Z").getTime();

    const rows = leads.filter(v => {
      const t = new Date(v.createdAt).getTime();
      return t >= fromTs && t <= toTs;
    });

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

    await ctx.replyWithDocument({
      source: Buffer.from("\uFEFF" + csvAll, "utf-8"),
      filename: `all_${fromDate}_${toDate}.csv`
    });

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

    await ctx.replyWithDocument({
      source: Buffer.from("\uFEFF" + csvLeads, "utf-8"),
      filename: `leads_${fromDate}_${toDate}.csv`
    });

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
    return ctx.reply(branches[raw], { parse_mode: "HTML" });
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

  // Акция Check‑Up
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

    await ctx.reply(
      "Спасибо! Я передал вашу заявку администратору. Мы скоро свяжемся с вами!\u2063",
      Markup.inlineKeyboard([
        Markup.button.url(
          "Наш Telegram - канал. Здесь выгодно!",
          "https://t.me/medgarantspb?utm_source=bot&utm_medium=lead&utm_campaign=invite"
        )
      ])
    );

    return;
  }

  // консультация
  if (state.section === "consultation") {
    state.context.push(raw);
  }

  state.context.push(raw);

  if (!state.invited && !state.waitingForPhone && !state.waitingForName) {
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


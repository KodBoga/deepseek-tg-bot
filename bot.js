import { Telegraf, Markup } from "telegraf";
import fetch from "node-fetch";

// === CONFIG ===
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const ADMIN_CHAT_IDS = (process.env.ADMIN_CHAT_IDS || "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

// === LOGGING ===
bot.use((ctx, next) => {
  console.log(`[${new Date().toISOString()}] From ${ctx.chat?.id}: ${ctx.message?.text}`);
  return next();
});

bot.catch((err, ctx) => {
  console.error(`Bot error for ${ctx.chat.id}:`, err);
});

// === STATE ===
const userState = {};

// === DEEPSEEK ===
async function askDeepSeek(prompt) {
  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "Не удалось получить ответ от ассистента.";
  } catch (e) {
    console.error("DeepSeek error:", e);
    return "Произошла ошибка при обращении к ассистенту.";
  }
}

// === CRM (заглушка) ===
async function sendToCRM(lead) {
  console.log("CRM LEAD:", lead);
  // Здесь можно подключить amoCRM / Bitrix / Unitee / Мегаплан
  return true;
}

// === KEYWORDS ===
const keywords = {
  "кариес": "Кариес — это разрушение зуба. Лучше пройти диагностику. Хотите записаться?",
  "имплант": "Имплантация — надёжный способ восстановления зуба. Могу записать вас на консультацию.",
  "чистка": "Профессиональная чистка стоит 3500 руб. Хотите записаться?",
  "камни": "Зубные камни лучше удалять раз в 6 месяцев. Могу записать вас на чистку."
};

// === SCHEDULE ===
const scheduleText = `
График работы клиники:
Пн–Пт: 10:00–20:00
Сб: 11:00–18:00
Вс: выходной
`;

// === /START ===
bot.start((ctx) => {
  const chatId = ctx.chat.id;

  userState[chatId] = {
    context: [],
    greeted: true,
    waitingForPhone: false,
    waitingForName: false,
    date: null,
    time: null,
    clarifyUsed: false,
    invited: false,
    phone: null,
    name: null
  };

  ctx.reply(
    "Здравствуйте! Вас приветствует стоматология «МедГарант». Что вас беспокоит?",
    Markup.keyboard([
      ["Болит зуб", "Проверка"],
      ["Хочу консультацию", "График работы"]
    ]).resize()
  );
});

// === MAIN HANDLER ===
bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const raw = ctx.message.text.trim();
  const state = userState[chatId] || {};

  // === KEYWORD AUTOREPLY ===
  for (const key in keywords) {
    if (raw.toLowerCase().includes(key)) {
      return ctx.reply(keywords[key]);
    }
  }

  // === BUTTONS ===
  if (raw === "График работы") {
    return ctx.reply(scheduleText);
  }

  if (raw === "Проверка") {
    return ctx.reply("Что именно хотите проверить?");
  }

  // === WAITING FOR PHONE ===
  if (state.waitingForPhone) {
    if (!raw.match(/^\+?\d[\d\s\-]{5,}$/)) {
      return ctx.reply("Похоже, номер в необычном формате. Напишите, пожалуйста, номер телефона ещё раз.");
    }

    state.phone = raw;
    state.waitingForPhone = false;
    state.waitingForName = true;

    return ctx.reply("Спасибо! Напишите, пожалуйста, ваше имя полностью (ФИО).");
  }

  // === WAITING FOR NAME ===
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

    await sendToCRM(lead);

    for (const adminId of ADMIN_CHAT_IDS) {
      await ctx.telegram.sendMessage(adminId, `
Новая заявка:
Имя: ${lead.name}
Телефон: ${lead.phone}
Дата: ${lead.date}
Время: ${lead.time}
Комментарий: ${lead.comment}
      `.trim());
    }

    userState[chatId] = null;

    return ctx.reply("Спасибо! Я передал вашу заявку администратору. Мы свяжемся с вами в ближайшее время.");
  }

  // === DATE/TIME DETECTION ===
  const dateRegex = /\b(сегодня|завтра|\d{1,2}\.\d{1,2})\b/i;
  const timeRegex = /\b(\d{1,2}[:.]?\d{0,2})\b/i;

  const foundDate = raw.match(dateRegex);
  const foundTime = raw.match(timeRegex);

  if (foundDate) state.date = foundDate[0];
  if (foundTime) state.time = foundTime[0];

  state.context.push(raw);

  // === CLARIFY ===
  if (!state.clarifyUsed) {
    state.clarifyUsed = true;
    return ctx.reply("Понимаю. А боль постоянная или появляется при накусывании?");
  }

  // === INVITE ===
  if (!state.invited) {
    state.invited = true;
    return ctx.reply(
      "Понимаю ситуацию. Чтобы врач точно оценил, что происходит, лучше прийти на первичный приём.\n\n" +
      "Сейчас действует акция: полный стоматологический check‑up — 3500 руб. вместо 4900 руб.\n" +
      "В стоимость входит консультация любого врача‑стоматолога и компьютерная 3D‑диагностика (КЛКТ).\n\n" +
      "Когда вам удобнее — сегодня, завтра или в другой день?"
    );
  }

  // === REQUEST PHONE ===
  if (!state.phone) {
    state.waitingForPhone = true;
    return ctx.reply("Чтобы записать вас на приём, напишите, пожалуйста, номер телефона для связи.");
  }

  // === FALLBACK ===
  const aiReply = await askDeepSeek(`Ответь как стоматолог: ${raw}`);
  return ctx.reply(aiReply);
});

bot.launch();

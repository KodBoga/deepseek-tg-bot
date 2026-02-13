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
  console.log(
    `[${new Date().toISOString()}] From ${ctx.chat?.id}: ${ctx.message?.text}`
  );
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
  // сюда потом можно воткнуть amo/Bitrix/Unitee
  return true;
}

// === KEYWORDS (быстрые автоответы) ===
const keywords = {
  "кариес": "Кариес — это разрушение зуба. Лучше пройти диагностику. Могу записать вас на приём.",
  "имплант": "Имплантация — надёжный способ восстановления зуба. Могу записать вас на консультацию.",
  "чистка": "Профессиональная чистка стоит 3500 руб. Хотите записаться?",
  "камн": "Зубные камни лучше удалять раз в 6 месяцев. Могу записать вас на чистку.",
  "запах": "Неприятный запах изо рта часто связан с налётом или проблемами дёсен. Лучше показаться врачу.",
};

// === SCHEDULE ===
const scheduleText = `
График работы клиники:
Пн–Пт: 10:00–20:00
Сб: 11:00–18:00
Вс: выходной
`;

// === КОНТЕКСТНЫЕ УТОЧНЯЮЩИЕ ВОПРОСЫ ===
const clarifyMap = [
  {
    keys: ["десна", "дёсна", "десны"],
    question: "А что именно с десной? Кровоточит, опухла, болит, есть неприятный запах?"
  },
  {
    keys: ["кровоточ", "кровь"],
    question: "Кровоточит при чистке, при еде или сама по себе?"
  },
  {
    keys: ["камн", "налет", "налёт"],
    question: "Налёт и камни беспокоят больше визуально или есть неприятные ощущения, запах?"
  },
  {
    keys: ["запах"],
    question: "Запах появился недавно или давно? Усиливается утром или после еды?"
  },
  {
    keys: ["скол"],
    question: "Скол большой или небольшой? Есть ли боль при накусывании или на холодное?"
  },
  {
    keys: ["чувств"],
    question: "Чувствительность на холодное, горячее или сладкое?"
  },
  {
    keys: ["пломб"],
    question: "Пломба выпала полностью или частично? Есть ли боль?"
  },
  {
    keys: ["коронк", "коронка"],
    question: "С коронкой что произошло — слетела, треснула или болит под ней?"
  },
  {
    keys: ["имплант"],
    question: "Имплант беспокоит? Боль, подвижность или дискомфорт в области импланта?"
  }
];

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
    "Здравствуйте! Вас приветствует стоматология «МедГарант». Подскажите, пожалуйста, что вас беспокоит.",
    Markup.keyboard([
      ["Болит зуб", "Десна"],
      ["Хочу консультацию", "График работы"]
    ]).resize()
  );
});

// === MAIN HANDLER ===
bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const raw = ctx.message.text.trim();
  const text = raw.toLowerCase();
  const state = (userState[chatId] ||= {
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
  });

  // Кнопка "График работы"
  if (raw === "График работы") {
    return ctx.reply(scheduleText);
  }

  // Кнопка "Десна"
  if (raw === "Десна") {
    state.context.push("десна");
    return ctx.reply("А что именно с десной? Кровоточит, опухла, болит, есть неприятный запах?");
  }

  // Кнопка "Болит зуб"
  if (raw === "Болит зуб") {
    state.context.push("болит зуб");
    return ctx.reply("Боль постоянная, при накусывании или на холодное/горячее?");
  }

  // Кнопка "Хочу консультацию"
  if (raw === "Хочу консультацию") {
    state.invited = true;
    return ctx.reply(
      "Могу записать вас на консультацию к врачу.\n\n" +
      "Сейчас действует акция: полный стоматологический check‑up — 3500 руб. вместо 4900 руб.\n" +
      "В стоимость входит консультация любого врача‑стоматолога и компьютерная 3D‑диагностика (КЛКТ).\n\n" +
      "Когда вам удобнее — сегодня, завтра или в другой день?"
    );
  }

  // Автоответы по ключевым словам
  for (const key in keywords) {
    if (text.includes(key)) {
      await ctx.reply(keywords[key]);
      // не выходим — дальше всё равно пойдём по сценарию записи
      break;
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

    await sendToCRM(lead);

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

  // Пытаемся вытащить дату/время из текста
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
    return ctx.reply("Понимаю. Расскажите, пожалуйста, чуть подробнее, что именно вас беспокоит.");
  }

  // Приглашение на приём + акция (один раз)
  if (!state.invited) {
    state.invited = true;
    return ctx.reply(
      "Понимаю ситуацию. Чтобы врач точно оценил, что происходит, лучше прийти на первичный приём.\n\n" +
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

  // Фоллбек — DeepSeek как умный ассистент
  const aiReply = await askDeepSeek(`Ответь как стоматолог, кратко и по делу: ${raw}`);
  return ctx.reply(aiReply);
});

bot.launch();

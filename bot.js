import { Telegraf } from "telegraf";
import fetch from "node-fetch";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

bot.on("text", async (ctx) => {
  const userMessage = ctx.message.text;

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
            content:
              "Ты — вежливый ассистент стоматологической клиники. Не даёшь медицинских рекомендаций, помогаешь с записью и вопросами об услугах."
          },
          { role: "user", content: userMessage }
        ]
      })
    });

    const data = await response.json();
    console.log("Ответ от DeepSeek:", JSON.stringify(data, null, 2));

    const reply =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      "Ошибка: нет ответа от модели.";

    await ctx.reply(reply);
  } catch (err) {
    console.error("Ошибка запроса:", err);
    await ctx.reply("Произошла ошибка при обращении к модели.");
  }
});

bot.launch();

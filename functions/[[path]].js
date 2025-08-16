
// =================================================================================
// FUNÇÃO DE CHAMADA PARA O OPENROUTER
// =================================================================================

async function callOpenRouter(modelId, prompt, env) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) throw new Error(`Erro na API do OpenRouter para o modelo ${modelId}: ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

// =================================================================================
// ORQUESTRADOR PRINCIPAL E TELEGRAM
// =================================================================================

async function handleTelegramUpdate(message, env) {
  const chatId = message.chat.id;
  const userText = message.text || "";

  try {
    let modelId = "";
    let prompt = "";
    let modelName = "";

    if (userText.startsWith("/chimera ")) {
      modelId = "tngtech/deepseek-r1t2-chimera:free";
      modelName = "DeepSeek R1T2 Chimera";
      prompt = userText.substring(9).trim();
    } else if (userText.startsWith("/glm ")) {
      modelId = "z-ai/glm-4.5-air:free";
      modelName = "GLM 4.5 Air";
      prompt = userText.substring(5).trim();
    } else if (userText.startsWith("/qwen ")) {
      modelId = "qwen/qwen-3-235b-a22b:free";
      modelName = "Qwen3 235B";
      prompt = userText.substring(6).trim();
    }

    if (modelId) {
      if (!prompt) throw new Error(`Por favor, insira uma pergunta após o comando.`);
      await sendMessage(chatId, `Recebido. Consultando ${modelName} no OpenRouter...`, env);
      const reply = await callOpenRouter(modelId, prompt, env);
      await sendMessage(chatId, `${modelName} respondeu:\n\n${reply}`, env);
    } else {
      await sendMessage(chatId, "Comandos de teste: /chimera, /glm, /qwen.", env);
    }
  } catch (e) {
    console.error(e);
    await sendMessage(chatId, `ERRO NA OPERAÇÃO: ${e.message}`, env);
  }
}

async function sendMessage(chatId, text, env) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

// Ponto de entrada do Worker
export async function onRequest(context) {
    const { request, env } = context;
    try {
      if (request.method === "POST") {
        const payload = await request.json();
        if (payload.message && payload.message.chat) {
          await handleTelegramUpdate(payload.message, env);
        }
      }
      return new Response("OK");
    } catch (e) {
      console.error("ERRO CRÍTICO:", e.stack);
      return new Response("OK");
    }
}


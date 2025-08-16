
// =========================================
// FUNÇÃO DE CHAMADA PARA O OPENROUTER
// =========================================
async function callOpenRouter(modelId, prompt, env) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": modelId,
        "messages": [{ "role": "user", "content": prompt }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API do OpenRouter para o modelo ${modelId}: ${errorText}`);
    }
    const data = await response.json();
    if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
      throw new Error(`A API retornou uma resposta vazia ou malformada para o modelo ${modelId}.`);
    }
    return data.choices[0].message.content;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      return `O modelo ${modelId} demorou muito para responder (timeout de 30s). Tente novamente.`;
    }
    throw error;
  }
}

// =========================================
// ORQUESTRADOR PRINCIPAL E TELEGRAM
// =========================================
async function handleTelegramUpdate(message, env) {
  const chatId = message.chat.id;
  const userText = message.text || "";
  
  let modelId = "";
  let modelName = "";
  let prompt = "";

  try {
    if (userText.startsWith("/chimera ")) {
      modelId = "tngtech/deepseek-r1t2-chimera:free";
      modelName = "DeepSeek R1T2 Chimera";
      prompt = userText.substring(9).trim();
    } else if (userText.startsWith("/glm ")) {
      modelId = "z-ai/glm-4.5-air:free";
      modelName = "GLM 4.5 Air";
      prompt = userText.substring(5).trim();
    } else if (userText.startsWith("/qwen ")) {
      modelId = "qwen/qwen-2.5-72b-instruct:free"; 
      modelName = "Qwen 2.5 72B";
      prompt = userText.substring(6).trim();
    } else if (userText.trim() === "/ping") {
      modelId = "z-ai/glm-4.5-air:free";
      modelName = "GLM 4.5 Air (Teste de Ping)";
      prompt = "Responda apenas com a palavra: ok";
    }

    if (prompt) {
      await sendMessage(chatId, `Recebido. Consultando ${modelName} no OpenRouter...`, env);
      const reply = await callOpenRouter(modelId, prompt, env);
      await sendMessage(chatId, `**${modelName} respondeu:**\n\n${reply}`, env);
    } else {
      await sendMessage(chatId, "Comando não reconhecido. Use /chimera, /glm, /qwen ou o teste /ping.", env);
    }
  } catch (e) {
    console.error(e);
    await sendMessage(chatId, `ERRO NA OPERAÇÃO: ${e.message}`, env);
  }
}

async function sendMessage(chatId, text, env) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown"
  };

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// =========================================
// PONTO DE ENTRADA DO WORKER
// =========================================
export default {
  async fetch(request, env, ctx) {
    if (request.method === "POST") {
      try {
        const payload = await request.json();
        if (payload.message) {
          await handleTelegramUpdate(payload.message, env);
        }
      } catch (e) {
        console.error("ERRO CRÍTICO:", e.stack);
      }
    }
    return new Response("OK");
  }
};


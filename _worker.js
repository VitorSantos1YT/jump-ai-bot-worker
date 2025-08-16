
// =========================================
// FUNÇÃO DE CHAMADA PARA O OPENROUTER
// =========================================
async function callOpenRouter(modelId, prompt, env, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  const body = {
    model: modelId,
    messages: [{ role: "user", content: prompt }],
    ...options 
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
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
      return `O modelo ${modelId} demorou muito para responder (timeout de 180s). Tente novamente.`;
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
  let options = {};

  try {
    if (userText.startsWith("/chimera ")) {
      modelId = "tngtech/deepseek-r1t2-chimera:free";
      modelName = "Engenheiro Preciso (Chimera)";
      prompt = userText.substring(9).trim();
      options = {
        temperature: 0.2,
        max_tokens: 8192,
        frequency_penalty: 0.4
      };
    } else if (userText.startsWith("/qwen ")) {
      modelId = "qwen/qwen-2.5-72b-instruct:free"; 
      modelName = "Consultor Dinâmico (Qwen)";
      prompt = userText.substring(6).trim();
      options = {
        temperature: 0.6,
        max_tokens: 8192
      };
    }

    if (prompt) {
      await sendMessage(chatId, `Recebido. Missão de alta complexidade atribuída ao **${modelName}**. Isso pode levar até 3 minutos...`, env);
      const reply = await callOpenRouter(modelId, prompt, env, options);
      await sendMessage(chatId, `**${modelName} concluiu a missão:**\n\n${reply}`, env);
    } else {
      await sendMessage(chatId, "Comando não reconhecido. Use **/chimera** (para código/lógica) ou **/qwen** (para ideias/consultoria) seguido da sua pergunta.", env);
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


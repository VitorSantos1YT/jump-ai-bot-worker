
export default {
  async fetch(request, env) {
    // ESTE É O TRY...CATCH MAIS IMPORTANTE. ELE PEGA QUALQUER ERRO.
    try {
      if (request.method === "POST") {
        const payload = await request.json();
        if (payload.message) {
          await handleUpdate(payload.message, env);
        }
      }
    } catch (e) {
      console.error("ERRO CRÍTICO NO FETCH PRINCIPAL:", e);
    }
    // Sempre retorne OK para o Telegram, não importa o que aconteça.
    return new Response("OK", { status: 200 });
  }
};

async function handleUpdate(message, env) {
  const chatId = message.chat.id;
  const userText = message.text || "(Mensagem sem texto)";

  try {
    // --- CORREÇÃO DE SINTAXE CRÍTICA AQUI ---
    const promptText = `Como um CEO de IA, recebi a seguinte mensagem de um usuário: "${userText}". Minha primeira ação é confirmar o recebimento e o início do plano.`;
    
    const geminiPayload = {
      contents: [{
        parts: [{ text: promptText }]
      }]
    };

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${env.GOOGLE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload) // Usamos o objeto construído separadamente
    });

    if (!geminiResponse.ok) {
        // Se a resposta da API não foi bem-sucedida (ex: erro 400, 401, 500)
        const errorBody = await geminiResponse.text();
        throw new Error(`A API do Gemini retornou um erro: ${geminiResponse.status} ${errorBody}`);
    }

    const geminiData = await geminiResponse.json();

    if (geminiData && geminiData.candidates && geminiData.candidates.length > 0) {
      const responseText = geminiData.candidates[0].content.parts[0].text;
      await sendMessage(chatId, responseText, env);
    } else {
      console.error("Resposta inesperada da API Gemini:", JSON.stringify(geminiData));
      await sendMessage(chatId, "Não recebi uma resposta válida da IA no momento.", env);
    }

  } catch (e) {
    console.error("Erro no handleUpdate:", e);
    await sendMessage(chatId, `Ocorreu um erro interno: ${e.message}`, env);
  }
}

async function sendMessage(chatId, text, env) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  // Não precisamos de try/catch aqui, pois o principal já está protegido.
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}


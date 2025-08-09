
export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      try {
        const payload = await request.json();
        if (payload.message) {
          await handleUpdate(payload.message, env);
        }
      } catch (e) {
        // Se algo der errado no fluxo principal, vamos logar o erro.
        console.error("Erro no fetch principal:", e);
      }
    }
    return new Response("OK");
  }
};

async function handleUpdate(message, env) {
  const chatId = message.chat.id;
  
  try {
    const userText = message.text || "(Mensagem sem texto)";

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${env.GOOGLE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Como um CEO de IA, recebi a seguinte mensagem de um usuário: "${userText}". Minha primeira ação é confirmar o recebimento e o início do plano.` }]
        }]
      })
    });

    const geminiData = await geminiResponse.json();

    // --- CÓDIGO MAIS ROBUSTO AQUI ---
    // Verifica se a resposta foi bem-sucedida e se o texto existe
    if (geminiData && geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content && geminiData.candidates[0].content.parts && geminiData.candidates[0].content.parts[0]) {
      const responseText = geminiData.candidates[0].content.parts[0].text;
      await sendMessage(chatId, responseText, env);
    } else {
      // Se a resposta veio em um formato inesperado, avisa o usuário
      console.error("Resposta inesperada da API Gemini:", JSON.stringify(geminiData));
      await sendMessage(chatId, "Desculpe, não consegui processar a resposta da IA no momento.", env);
    }

  } catch (e) {
    // Se a chamada da API ou qualquer outra coisa falhar, avisa o usuário e loga o erro
    console.error("Erro no handleUpdate:", e);
    await sendMessage(message.chat.id, "Ocorreu um erro interno ao processar sua solicitação.", env);
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


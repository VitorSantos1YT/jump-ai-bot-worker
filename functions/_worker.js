
export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      const payload = await request.json();
      if (payload.message) {
        await handleUpdate(payload.message, env);
      }
    }
    return new Response("OK");
  }
};

async function handleUpdate(message, env) {
  const chatId = message.chat.id;
  
  const userText = message.text || "(Mensagem sem texto)";

  // Esta é a chamada para a API do Google Gemini
  const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${env.GOOGLE_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `Como um CEO de IA, recebi a seguinte mensagem de um usuário: "${userText}". Minha primeira ação é confirmar o recebimento e o início do plano.` }]
      }]
    })
  });

  const geminiData = await geminiResponse.json();
  const responseText = geminiData.candidates[0].content.parts[0].text;

  await sendMessage(chatId, responseText, env);
}

async function sendMessage(chatId, text, env) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}



// Arquivo: functions/[[path]].js

// IA para conversas rápidas (usada pelo site e pelo Telegram)
async function callLlamaForChat(prompt, env) {
  const systemPrompt = "Você é Jump.ai, um assistente de IA prestativo e direto. Responda de forma concisa.";
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3-8b-8192", // Usamos o modelo 8b super rápido para chat
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }]
    })
  });
  if (!response.ok) throw new Error(`Erro na API do Llama: ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

// Orquestrador para o Telegram
async function handleTelegramUpdate(message, env) {
  const chatId = message.chat.id;
  const userText = message.text || "";
  
  // A lógica completa do /edite, /crie e da conversa normal vai aqui
  // Por enquanto, vamos fazer ele conversar.
  const reply = await callLlamaForChat(userText, env);
  await sendMessage(chatId, reply, env);
}

// Função para enviar mensagem no Telegram
async function sendMessage(chatId, text, env) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

// A função onRequest é a forma como o Cloudflare Pages Functions lida com requisições
export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    try {
      // ROTA PARA O CHAT DO SITE
      if (url.pathname === "/api/chat") {
        if (request.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: { "Content-Type": "application/json" } });
        const { message } = await request.json();
        const reply = await callLlamaForChat(message, env);
        return new Response(JSON.stringify({ reply }), { 
          headers: { "Content-Type": "application/json" } 
        });
      }

      // ROTA PARA O BOT DO TELEGRAM (geralmente no pathname raiz)
      // O Telegram envia para a URL raiz, então não filtramos o pathname
      if (request.method === "POST") {
        const payload = await request.json();
        if (payload.message && payload.message.chat) {
          await handleTelegramUpdate(payload.message, env);
        }
      }
      
      // Se não for nenhuma das rotas acima, retorna OK.
      return new Response("OK");

    } catch (e) {
      console.error("ERRO CRÍTICO:", e.stack);
      if (url.pathname === "/api/chat") {
        return new Response(JSON.stringify({ error: e.message }), { 
          status: 500, 
          headers: { "Content-Type": "application/json" } 
        });
      }
      return new Response("OK");
    }
}


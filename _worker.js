// VERSÃO FINAL - CÓDIGO SIMPLIFICADO COM FUNÇÕES DIRETAS

// --- FUNÇÕES DE API (Os Especialistas) ---

async function getSupabaseUser(env, userId) {
  const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/clients?telegram_id=eq.${userId}&select=*`;
  const response = await fetch(supabaseUrl, { headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` } });
  if (!response.ok) return { data: null, error: true };
  const data = await response.json();
  return { data: data.length > 0 ? data[0] : null, error: false };
}

async function runGroq(apiKey, userInput, systemInput = "Você é Jump.ai.") {
  const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
  const response = await fetch(groqUrl, { 
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
          messages: [ { role: "system", content: systemInput }, { role: "user", content: userInput } ],
          model: "llama3-70b-8192"
      })
  });
  if (!response.ok) return "Desculpe, meu cérebro (Groq) está com problemas.";
  const data = await response.json();
  return data.choices[0]?.message?.content || "Erro ao processar a resposta da IA.";
}

async function sendMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }), });
}

// --- O CÉREBRO PRINCIPAL ---

async function processMessage(message, env) {
  const chatId = message.chat.id;
  const userId = message.from.id.toString();
  const text = message.text || '(Mensagem não textual)';

  const client = await getSupabaseUser(env, userId);
  if (client.error || !client.data) {
      const errorMessage = client.error ? "Memória falhou." : `Acesso negado (${userId}).`;
      return sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
  }

  const aiResponse = await runGroq(env.GROQ_API_KEY, text);
  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
}

// --- O PONTO DE ENTRADA DO WORKER ---

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/telegram-webhook') {
        const payload = await request.json();
        if (payload.message) {
          ctx.waitUntil(processMessage(payload.message, env));
        }
        return new Response('OK');
      }
      return new Response('Assistente de IA está online.');
    } catch (e) {
      console.error(e);
      return new Response(`Erro fatal: ${e.message}`, { status: 500 });
    }
  }
};

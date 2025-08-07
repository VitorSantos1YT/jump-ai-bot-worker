// RECONSTRUÇÃO - BLOCO 2: ADICIONANDO A MEMÓRIA (SUPABASE)

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/telegram-webhook') {
        return this.handleTelegramWebhook(request, env, ctx);
      }
      if (url.pathname === '/setup') {
        return this.setupWebhook(request, env);
      }
      return new Response('Worker de diagnóstico está online. Bloco 2 (Memória) implementado.');
    } catch (e) {
      return new Response(`Erro fatal no Worker:\n${e.message}`, { status: 500 });
    }
  },

  async handleTelegramWebhook(request, env, ctx) {
    if (request.method !== 'POST') return new Response('Método não permitido');
    try {
      const payload = await request.json();
      if (payload.message) {
        ctx.waitUntil(this.processMessage(payload.message, env));
      }
      return new Response('OK');
    } catch (e) {
      console.error(e.stack);
      return new Response('Erro no webhook');
    }
  },

  async processMessage(message, env) {
    const chatId = message.chat.id;
    const userId = message.from.id.toString();
    const text = message.text || '(Mensagem não textual)';

    // A LÓGICA DO SUPABASE VOLTOU AQUI
    const client = await this.getSupabaseUser(env, userId);

    if (client.error) {
        return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "ERRO: Falha ao conectar com a Memória (Supabase).");
    }
    
    if (!client.data) {
        return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Acesso negado. Seu ID (${userId}) não está na minha lista.`);
    }

    // Se ele passar pela verificação, ele confirma
    const responseText = `BLOCO 2 OK! Olá, ${client.data.client_name}. Sua identidade foi confirmada na memória.`;
    await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, responseText);
  },

  // A FUNÇÃO DO SUPABASE ESTÁ DE VOLTA
  async getSupabaseUser(env, userId) {
    const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/clients?telegram_id=eq.${userId}&select=*`;
    try {
        const response = await fetch(supabaseUrl, {
            headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`
            }
        });
        if (!response.ok) {
            console.error("Erro no Supabase:", await response.text());
            return { data: null, error: true };
        }
        const data = await response.json();
        return { data: data.length > 0 ? data[0] : null, error: false };
    } catch (e) {
        console.error("Erro ao conectar com Supabase:", e);
        return { data: null, error: true };
    }
  },
  
  async sendMessage(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  },

  async setupWebhook(request, env) {
    const workerUrl = `https://${new URL(request.url).hostname}`;
    const webhookUrl = `${workerUrl}/telegram-webhook`;
    const telegramApiUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
    const response = await fetch(telegramApiUrl);
    const result = await response.json();
    return new Response(`Webhook configurado para: ${webhookUrl}\n\nResposta do Telegram: ${JSON.stringify(result)}`);
  }
};

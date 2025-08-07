// VERSÃO DE DIAGNÓSTICO FINAL: SÓ O TELEGRAM

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
      return new Response('Worker de diagnóstico está online.');
    } catch (e) {
      return new Response(`Erro fatal: ${e.message}`);
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
    const text = message.text || '(Mensagem não textual)';
    const responseText = `Teste de diagnóstico OK! Recebi sua mensagem: "${text}"`;
    await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, responseText);
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

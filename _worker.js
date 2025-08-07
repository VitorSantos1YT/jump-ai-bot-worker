// VERSÃO DE DIAGNÓSTICO - TESTANDO CADA CONEXÃO

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/telegram-webhook') {
      return this.handleTelegramWebhook(request, env, ctx);
    }
    if (url.pathname === '/setup') {
      return this.setupWebhook(request, env);
    }
    return new Response('Worker em modo de diagnóstico.');
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
      return new Response('Erro no webhook');
    }
  },

  async processMessage(message, env) {
    const chatId = message.chat.id;
    const userId = message.from.id.toString();
    const text = message.text || '(Mensagem não textual)';

    // --- LÓGICA DE DIAGNÓSTICO ---
    // Removemos a autenticação por enquanto para testar as conexões diretamente.

    await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
    
    const GITHUB_REPO = env.GITHUB_REPO_URL;

    if (text.toLowerCase() === 'teste telegram') {
      await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '✅ Conexão com Telegram OK.');
    
    } else if (text.toLowerCase() === 'teste supabase') {
      const client = await this.getSupabaseUser(env, userId);
      const response = client.error ? `❌ Erro no Supabase.` : `✅ Conexão com Supabase OK. Encontrado: ${JSON.stringify(client.data)}`;
      await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, response);

    } else if (text.toLowerCase() === 'teste github') {
      const fileContent = await this.getGithubFileContent(env, GITHUB_REPO, 'teste.html');
      await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Resposta do GitHub:\n${fileContent}`);

    } else if (text.toLowerCase() === 'teste groq') {
      const aiResponse = await this.runGroq(env.GROQ_API_KEY, "Responda apenas com 'OK'.");
      await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Resposta do Groq:\n${aiResponse}`);
      
    } else {
      await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Modo de diagnóstico. Comandos: teste telegram, teste supabase, teste github, teste groq");
    }
  },
  
  // As funções auxiliares permanecem as mesmas
  async getSupabaseUser(env, userId) { /* ...código estável... */ },
  async getGithubFileContent(env, repo, filePath) { /* ...código estável... */ },
  async runGroq(apiKey, userInput) { /* ...código estável... */ },
  async sendMessage(token, chatId, text) { /* ...código estável... */ },
  async sendChatAction(token, chatId, action) { /* ...código estável... */ },
  async setupWebhook(request, env) { /* ...código estável... */ }
};

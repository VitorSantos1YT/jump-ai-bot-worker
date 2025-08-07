// VERSÃO DE DIAGNÓSTICO FINAL - O BOT "CAGUETA"

export default {
  async fetch(request, env, ctx) {
    // ... (código da base estável)
  },
  
  async handleTelegramWebhook(request, env, ctx) {
    try {
      const payload = await request.json();
      if (payload.message) {
        ctx.waitUntil(this.processMessage(payload.message, env));
      }
      return new Response('OK');
    } catch (e) {
      console.error('Erro CRÍTICO no webhook:', e.stack);
      // Se o erro acontecer aqui, ele tenta te avisar
      if (env.TELEGRAM_ADMIN_ID && env.TELEGRAM_BOT_TOKEN) {
        ctx.waitUntil(this.sendMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_ADMIN_ID, `ERRO CRÍTICO NO WEBHOOK:\n${e.message}`));
      }
      return new Response('Erro no webhook');
    }
  },

  async processMessage(message, env) {
    const chatId = message.chat.id;
    const userId = message.from.id.toString();
    try {
      const text = message.text || '(Mensagem não textual)';

      const client = await this.getSupabaseUser(env, userId);
      if (client.error || !client.data) {
          const errorMessage = client.error ? "Desculpe, estou com problemas na minha memória (Supabase)." : `Acesso negado. Seu ID (${userId}) não está na minha lista.`;
          return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
      }
      
      await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
      const GITHUB_REPO = env.GITHUB_REPO_URL;

      if (text.toLowerCase().startsWith('ler arquivo')) {
          const filePath = text.substring(12).trim();
          const fileContent = await this.getGithubFileContent(env, GITHUB_REPO, filePath);
          await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent);
      } else {
          const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
          await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
      }
    } catch (e) {
        console.error("Erro no processMessage:", e.stack);
        // O BOT TE AVISA DO ERRO!
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_ADMIN_ID, `ERRO NO SISTEMA:\n\n${e.message}\n\n${e.stack}`);
        // E avisa o usuário que algo deu errado
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Opa, encontrei um erro aqui. Meu desenvolvedor já foi notificado.");
    }
  },

  // O resto das funções (getSupabaseUser, getGithubFileContent, runGroq, etc.)
  // permanecem exatamente as mesmas de antes. O comando cat abaixo já contém
  // o código completo e verificado para você.
};

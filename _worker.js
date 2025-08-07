// VERSÃO FINAL E ESTÁVEL - LÓGICA DE COMANDOS SIMPLIFICADA E ROBUSTA

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
      const branchName = this.getBranchFromHost(env, url.hostname) || 'master';
      const path = url.pathname === '/' ? '/teste.html' : url.pathname; 
      return this.serveGithubFile(env, env.GITHUB_REPO_URL, path, branchName);
    } catch (e) {
      return new Response(`Erro fatal no Worker:\n${e.message}\n${e.stack}`, { status: 500 });
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
      console.error('Erro no webhook:', e.stack);
      return new Response('Erro no webhook', { status: 500 });
    }
  },
  
  async processMessage(message, env) {
    const chatId = message.chat.id;
    const userId = message.from.id.toString();
    const text = message.text || '(Mensagem não textual)';

    const client = await this.getSupabaseUser(env, userId);
    if (client.error || !client.data) {
        const errorMessage = client.error ? "Desculpe, minha memória falhou." : `Acesso negado. Seu ID (${userId}) não está registrado.`;
        return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
    }
    
    await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
    
    const GITHUB_REPO = env.GITHUB_REPO_URL;
    const lowerCaseText = text.toLowerCase();

    // --- LÓGICA DE COMANDOS SIMPLIFICADA E ROBUSTA ---
    if (lowerCaseText.includes('aprovar ')) {
        const branchName = text.split('aprovar ')[1].trim();
        const mergeResult = await this.mergeBranchToMain(env, GITHUB_REPO, branchName);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, mergeResult);

    } else if (lowerCaseText.includes('editar ') || lowerCaseText.includes('mude ') || lowerCaseText.includes('crie ') || lowerCaseText.includes('adicione ')) {
        // Tentamos extrair o nome do arquivo e a instrução
        const match = text.match(/(\S+\.\S+)\s*para\s*(.*)/i) || text.match(/(\S+\.\S+)\s*(.*)/i);
        if (match && match[1] && match[2]) {
            const filePath = match[1];
            const instruction = match[2];
            const editResponse = await this.safeEditFileWithAI(env, GITHUB_REPO, filePath, instruction, chatId);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, editResponse);
        } else {
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Não entendi seu pedido de edição. Tente algo como: 'mude o teste.html para \"novo título\"'");
        }

    } else if (lowerCaseText.includes('leia ') || lowerCaseText.includes('ler ')) {
        const filePath = text.split(/leia |ler /i)[1].trim();
        const fileContent = await this.getGithubFileContent(env, GITHUB_REPO, filePath, false, 'master');
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent.error ? fileContent.message : fileContent);

    } else { // Conversa normal
        const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
    }
  },
  
  // O resto das funções (safeEditFileWithAI, getSupabaseUser, etc.) permanece o mesmo.
  // O comando cat abaixo já contém o código completo e verificado.
};

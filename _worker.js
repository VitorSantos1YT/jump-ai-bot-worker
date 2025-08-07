// FASE 4.1 - COM PROMPT À PROVA DE FALHAS PARA EDIÇÃO DE CÓDIGO

export default {
  async fetch(request, env, ctx) {
    // ... (código existente)
    try {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
      const url = new URL(request.url);
      if (url.pathname === '/telegram-webhook') {
        return this.handleTelegramWebhook(request, env, ctx);
      }
      if (url.pathname === '/setup') {
        return this.setupWebhook(request, env);
      }
      const branchName = this.getBranchFromHost(url.hostname, env) || 'master';
      const path = url.pathname === '/' ? '/teste.html' : url.pathname; 
      return this.serveGithubFile(env, env.GITHUB_REPO_URL, path, branchName);
    } catch (e) {
      console.error(e);
      return new Response(`Erro fatal no Worker:\n\nERRO: ${e.message}\n\nPILHA DE ERROS:\n${e.stack}`, { status: 500 });
    }
  },

  async handleTelegramWebhook(request, env, ctx) {
    // ... (código existente)
    if (request.method !== 'POST') return new Response('Método não permitido', { status: 405 });
    try {
      const payload = await request.json();
      if (payload.message) {
        ctx.waitUntil(this.processMessage(payload.message, env));
      }
      return new Response('OK');
    } catch (e) {
      console.error(e.stack);
      return new Response('Erro ao processar o payload inicial', { status: 500 });
    }
  },
  
  async processMessage(message, env) {
    // ... (código existente)
    const chatId = message.chat.id;
    const userId = message.from.id.toString();
    const text = message.text || '(Mensagem não textual)';
    const client = await this.getSupabaseUser(env, userId);
    if (client.error || !client.data) {
        const errorMessage = client.error ? "Desculpe, estou com problemas na minha memória." : `Acesso negado. Seu ID (${userId}) não está registrado.`;
        return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
    }
    await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
    const GITHUB_REPO = env.GITHUB_REPO_URL;
    if (text.toLowerCase().startsWith('editar arquivo')) {
        const parts = text.substring(15).trim().split('"');
        const filePath = parts[0].trim();
        const instruction = parts[1];
        if (!filePath || !instruction) return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Formato inválido.");
        const response = await this.safeEditFileWithAI(env, GITHUB_REPO, filePath, instruction);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, response);
    } else if (text.toLowerCase().startsWith('aprovar')) {
        const branchName = text.substring(8).trim();
        if (!branchName) return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Especifique o nome do rascunho.");
        const mergeResult = await this.mergeBranchToMain(env, GITHUB_REPO, branchName);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, mergeResult);
    } else {
        const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
    }
  },

  async safeEditFileWithAI(env, repo, filePath, instruction) {
    const mainBranchSha = await this.getBranchSha(env, repo, 'master');
    if (!mainBranchSha) return "❌ Não consegui encontrar a branch principal do projeto.";
    const originalFile = await this.getGithubFileContent(env, repo, filePath, true, 'master');
    if (originalFile.error) return originalFile.message;
    
    // A MUDANÇA ESTÁ NA PRÓXIMA LINHA
    const newContent = await this.generateNewContentWithAI(env, filePath, instruction, originalFile.content);
    
    if (newContent.startsWith("Desculpe")) return newContent;
    const branchName = `ai-edit-${Date.now()}`;
    const createBranchResult = await this.createGithubBranch(env, repo, branchName, mainBranchSha);
    if (!createBranchResult.success) {
      const errorText = await createBranchResult.message.text();
      return `❌ Falha ao criar o ambiente de teste: ${errorText}`;
    }
    const commitResult = await this.updateGithubFile(env, repo, filePath, newContent, originalFile.sha, `feat: edita ${filePath} via IA`, branchName);
    if (commitResult.success) {
        const repoName = repo.split('/')[1];
        const previewUrl = `https://${branchName}.${repoName}.pages.dev`;
        return `✅ Criei um ambiente de teste.\n\n` +
               `👀 Veja como ficou: ${previewUrl}\n\n` +
               `👍 Para aprovar, responda com:\n` +
               `\`aprovar ${branchName}\``;
    } else {
        return `❌ Falha ao salvar no ambiente de teste.\nErro: ${commitResult.message}`;
    }
  },

  /**
   * ATUALIZADO: O PROMPT DO SISTEMA AGORA É EXTREMAMENTE ESPECÍFICO
   */
  async generateNewContentWithAI(env, filePath, instruction, originalContent) {
    const systemPrompt = `Você é um sistema autônomo de desenvolvimento de software. Sua única tarefa é reescrever e retornar o conteúdo completo e atualizado de um arquivo de código, aplicando uma instrução. NÃO forneça explicações. NÃO forneça comandos de terminal como 'sed' ou 'git'. NÃO escreva nenhuma palavra além do código do arquivo. Sua resposta deve começar com a primeira linha do arquivo (ex: <!DOCTYPE html>) e terminar com a última linha (ex: </html>).`;
    const userPrompt = `INSTRUÇÃO: "${instruction}"\n\nCONTEÚDO ATUAL DO ARQUIVO '${filePath}':\n\n\`\`\`\n${originalContent}\n\`\`\``;
    return this.runGroq(env.GROQ_API_KEY, userPrompt, systemPrompt);
  },

  // O resto das funções permanece igual. O comando cat abaixo contém o código completo e verificado.
  async getBranchSha(env, repo, branchName) { /* ... */ },
  async createGithubBranch(env, repo, newBranchName, sha) { /* ... */ },
  async mergeBranchToMain(env, repo, branchName) { /* ... */ },
  async updateGithubFile(env, repo, filePath, newContent, sha, commitMessage, branchName = 'master') { /* ... */ },
  async getGithubFileContent(env, repo, filePath, getFullObject = false, branchName = 'master') { /* ... */ },
  async getSupabaseUser(env, userId) { /* ... */ },
  async runGroq(apiKey, userInput, systemInput) { /* ... */ },
  async sendMessage(token, chatId, text) { /* ... */ },
  async sendChatAction(token, chatId, action) { /* ... */ },
  async setupWebhook(request, env) { /* ... */ }
};

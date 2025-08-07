// VERSÃO FINAL E ESTÁVEL - FASE 4 COM PREVIEWS E SEM DEPENDÊNCIAS

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
      console.error(e);
      return new Response(`Erro fatal no Worker:\n\nERRO: ${e.message}\n\nPILHA DE ERROS:\n${e.stack}`, { status: 500 });
    }
  },

  async handleTelegramWebhook(request, env, ctx) {
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
    const newContent = await this.generateNewContentWithAI(env, filePath, instruction, originalFile.content);
    if (newContent.startsWith("Desculpe")) return newContent;
    const branchName = `ai-edit-${Date.now()}`;
    const createBranchResult = await this.createGithubBranch(env, repo, branchName, mainBranchSha);
    if (!createBranchResult.success) {
      const errorText = await createBranchResult.response.text();
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

  async generateNewContentWithAI(env, filePath, instruction, originalContent) {
    const systemPrompt = `Você é um dev web expert. Edite o arquivo a seguir. Retorne APENAS o conteúdo completo e atualizado do arquivo.`;
    const userPrompt = `INSTRUÇÃO: "${instruction}"\n\nCONTEÚDO ATUAL DO ARQUIVO '${filePath}':\n\n\`\`\`\n${originalContent}\n\`\`\``;
    return this.runGroq(env.GROQ_API_KEY, userPrompt, systemPrompt);
  },

  getBranchFromHost(env, hostname) {
    const repoName = env.GITHUB_REPO_URL.split('/')[1];
    const productionHost = `${repoName}.pages.dev`;
    if (hostname.endsWith(productionHost)) {
        const subdomain = hostname.replace(`.${productionHost}`, '');
        if (subdomain !== repoName && subdomain !== 'www' && subdomain.startsWith('ai-edit')) { 
            return subdomain;
        }
    }
    return null;
  },

  async serveGithubFile(env, repo, filePath, branchName) {
    const cleanFilePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    const fileData = await this.getGithubFileContent(env, repo, cleanFilePath, true, branchName);
    if (fileData.error) {
        return new Response(`Arquivo não encontrado: ${cleanFilePath}`, { status: 404 });
    }
    const contentType = cleanFilePath.endsWith('.css') ? 'text/css' : 
                      cleanFilePath.endsWith('.js') ? 'application/javascript' : 
                      'text/html;charset=utf-8';
    return new Response(fileData.content, { headers: { 'Content-Type': contentType } });
  },

  async getBranchSha(env, repo, branchName) { /* ... */ },
  async createGithubBranch(env, repo, newBranchName, sha) { /* ... */ },
  async mergeBranchToMain(env, repo, branchName) { /* ... */ },
  async updateGithubFile(env, repo, filePath, newContent, sha, commitMessage, branchName = 'master') { /* ... */ },
  async getGithubFileContent(env, repo, filePath, getFullObject = false, branchName = 'master') { /* ... */ },
  async getSupabaseUser(env, userId) { /* ... */ },
  async runGroq(apiKey, userInput, systemInput = "Você é Jump.ai.") { /* ... */ },
  async sendMessage(token, chatId, text) { /* ... */ },
  async sendChatAction(token, chatId, action) { /* ... */ },
  async setupWebhook(request, env) { /* ... */ }
};

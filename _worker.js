// --- JUMP.AI BOT - VERSÃO 1.0 - CÓDIGO DE PRODUÇÃO ---

export default {
  /**
   * Ponto de entrada principal. Atua como um roteador.
   */
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      
      // Rota para o Telegram enviar mensagens
      if (url.pathname === '/telegram-webhook') {
        return this.handleTelegramWebhook(request, env, ctx);
      }
      
      // Rota para configurar o bot (só usamos uma vez)
      if (url.pathname === '/setup') {
        return this.setupWebhook(request, env);
      }

      // Se não for uma rota especial, age como um servidor web para os previews
      const branchName = this.getBranchFromHost(env, url.hostname) || 'master';
      const path = url.pathname === '/' ? '/teste.html' : url.pathname; // Mostra teste.html por padrão
      
      return this.serveGithubFile(env, path, branchName);

    } catch (e) {
      console.error(e);
      return new Response(`Erro fatal no Worker:\n\nERRO: ${e.message}\n\nPILHA DE ERROS:\n${e.stack}`, { status: 500 });
    }
  },

  /**
   * Recebe e valida o webhook do Telegram.
   */
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
  
  /**
   * O Gerente de Projetos: orquestra todo o fluxo.
   */
  async processMessage(message, env) {
    const chatId = message.chat.id;
    const userId = message.from.id.toString();
    const text = message.text || '(Mensagem não textual)';

    // 1. AUTENTICAÇÃO
    const client = await this.getSupabaseUser(env, userId);
    if (client.error || !client.data) {
        const errorMessage = client.error ? "Desculpe, minha memória (Supabase) falhou." : `Acesso negado. Seu ID (${userId}) não está registrado.`;
        return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
    }
    
    await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
    
    // 2. ANÁLISE DE INTENÇÃO (O AGENTE MESTRE DECIDE O QUE FAZER)
    const intent = await this.getIntentWithAI(env, text);
    const GITHUB_REPO = env.GITHUB_REPO_URL;

    switch (intent.action) {
      case 'edit_file':
        if (!intent.file_path || !intent.instruction) return await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Não entendi qual arquivo ou o que você quer editar.");
        const editResponse = await this.safeEditFileWithAI(env, GITHUB_REPO, intent.file_path, intent.instruction);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, editResponse);
        break;

      case 'approve_change':
        if (!intent.branch_name) return await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Não entendi qual rascunho você quer aprovar.");
        const mergeResult = await this.mergeBranchToMain(env, GITHUB_REPO, intent.branch_name);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, mergeResult);
        break;

      default: // "conversation"
        const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
        break;
    }
  },
  
  // --- CÉREBRO E ESPECIALISTAS (AS IAs) ---

  async getIntentWithAI(env, userInput) {
    const systemPrompt = `Analise a mensagem do usuário. Sua tarefa é extrair a intenção e entidades. Responda APENAS com um objeto JSON válido.
As ações (action) possíveis são: "edit_file", "approve_change", "conversation".
- Se a intenção for editar/modificar/criar/adicionar/remover algo em um arquivo, use "edit_file" e extraia o 'file_path' e a 'instruction' completa.
- Se a intenção for aprovar/publicar/subir uma mudança, use "approve_change" e extraia o 'branch_name'.
- Para todo o resto (saudações, perguntas, etc.), use "conversation".

Exemplos:
- User: "mude o h1 do teste.html para 'Olá Mundo'" -> {"action": "edit_file", "file_path": "teste.html", "instruction": "mude o h1 para 'Olá Mundo'"}
- User: "aprovar ai-edit-12345" -> {"action": "approve_change", "branch_name": "ai-edit-12345"}
- User: "como vc está?" -> {"action": "conversation"}`;
    
    const responseText = await this.runGroq(env.GROQ_API_KEY, userInput, systemPrompt);
    try {
      return JSON.parse(responseText);
    } catch (e) {
      console.error("A IA não retornou JSON:", responseText);
      return { action: 'conversation' };
    }
  },

  async generateNewContentWithAI(env, filePath, instruction, originalContent) {
    const systemPrompt = `Você é um sistema autônomo de desenvolvimento de software. Sua única tarefa é reescrever e retornar o conteúdo completo e atualizado de um arquivo de código, aplicando uma instrução. NÃO forneça explicações. NÃO forneça comandos de terminal. NÃO escreva nada além do código do arquivo.`;
    const userPrompt = `INSTRUÇÃO: "${instruction}"\n\nCONTEÚDO ATUAL DO ARQUIVO '${filePath}':\n\n\`\`\`\n${originalContent}\n\`\`\``;
    return this.runGroq(env.GROQ_API_KEY, userPrompt, systemPrompt);
  },

  async runGroq(apiKey, userInput, systemInput = "Você é Jump.ai. Responda de forma concisa e útil.") {
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
      return data.choices[0].message.content;
  },

  // --- FERRAMENTAS (Os Braços, a Memória, etc.) ---
  
  async safeEditFileWithAI(env, repo, filePath, instruction) {
    await this.sendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, "Entendido. Criando ambiente de teste...");
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
    const commitResult = await this.updateGithubFile(env, repo, filePath, newContent, originalFile.sha, `feat: ${instruction.substring(0, 30)}`, branchName);
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

  async getSupabaseUser(env, userId) { /* ...código estável... */ },
  getBranchFromHost(env, hostname) { /* ...código estável... */ },
  async serveGithubFile(env, filePath, branchName) { /* ...código estável... */ },
  async getGithubFileContent(env, repo, filePath, getFullObject = false, branchName = 'master') { /* ...código estável... */ },
  async updateGithubFile(env, repo, filePath, newContent, sha, commitMessage, branchName = 'master') { /* ...código estável... */ },
  async getBranchSha(env, repo, branchName) { /* ...código estável... */ },
  async createGithubBranch(env, repo, newBranchName, sha) { /* ...código estável... */ },
  async mergeBranchToMain(env, repo, branchName) { /* ...código estável... */ },
  async sendMessage(token, chatId, text) { /* ...código estável... */ },
  async sendChatAction(token, chatId, action) { /* ...código estável... */ },
  async setupWebhook(request, env) { /* ...código estável... */ }
};

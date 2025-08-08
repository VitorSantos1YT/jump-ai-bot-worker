// --- JUMP.AI BOT - VERSÃO 1.0 - CÓDIGO DE PRODUÇÃO FINAL ---

export default {
  /**
   * Ponto de entrada principal. Atua como um roteador.
   */
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
   * O "Gerente de Projetos": orquestra todo o fluxo de uma mensagem.
   */
  async processMessage(message, env) {
    const chatId = message.chat.id;
    const userId = message.from.id.toString();
    const text = message.text || '(Mensagem não textual)';

    const client = await this.getSupabaseUser(env, userId);
    if (client.error || !client.data) {
        const errorMessage = client.error ? "Desculpe, minha memória (Supabase) falhou." : `Acesso negado. Seu ID (${userId}) não está registrado.`;
        return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
    }
    
    await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
    
    const GITHUB_REPO = env.GITHUB_REPO_URL;
    const lowerCaseText = text.toLowerCase();

    // Lógica de comando simplificada e robusta
    if (lowerCaseText.includes('aprovar ')) {
        const branchName = text.split('aprovar ')[1].trim();
        const mergeResult = await this.mergeBranchToMain(env, GITHUB_REPO, branchName);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, mergeResult);

    } else if (lowerCaseText.includes('editar ') || lowerCaseText.includes('mude ') || lowerCaseText.includes('crie ') || lowerCaseText.includes('adicione ')) {
        const match = text.match(/(editar|mude|crie|adicione)\s+(?:o\s+arquivo\s+)?(\S+\.\S+)\s*(?:para|com o texto|que diga)\s*["'](.*)["']/i);
        if (match && match[2] && match[3]) {
            const filePath = match[2];
            const instruction = match[3];
            const editResponse = await this.safeEditFileWithAI(env, GITHUB_REPO, filePath, instruction, chatId);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, editResponse);
        } else {
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Não entendi seu pedido de edição. Tente algo como: 'mude o teste.html para \"novo título\"'");
        }

    } else if (lowerCaseText.includes('leia ') || lowerCaseText.includes('ler ')) {
        const filePath = text.split(/leia o arquivo|ler arquivo/i)[1].trim();
        const fileContentResult = await this.getGithubFileContent(env, GITHUB_REPO, filePath, false, 'master');
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContentResult.error ? fileContentResult.message : fileContentResult);

    } else { // Conversa normal
        const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
    }
  },

  // --- FUNÇÕES DE LÓGICA DE NEGÓCIO ---

  async safeEditFileWithAI(env, repo, filePath, instruction, chatId) {
    await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Entendido. Preparando o ambiente de teste...");
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

    const commitResult = await this.updateGithubFile(env, repo, filePath, newContent, originalFile.sha, `feat: ${instruction.substring(0, 30)}...`, branchName);
    
    if (commitResult.success) {
        const repoName = repo.split('/')[1];
        const previewUrl = `https://${branchName}.${repoName}.pages.dev`;
        
        return `✅ Criei um ambiente de teste com sua alteração.\n\n` +
               `👀 Veja como ficou aqui: ${previewUrl}\n\n` +
               `👍 Se gostar, responda com:\n` +
               `\`aprovar ${branchName}\``;
    } else {
        return `❌ Falha ao salvar no ambiente de teste.\nErro: ${commitResult.message}`;
    }
  },
  
  // --- FUNÇÕES DE IA ---

  async generateNewContentWithAI(env, filePath, instruction, originalContent) {
    const systemPrompt = `Você é um sistema autônomo de desenvolvimento de software. Sua única tarefa é reescrever e retornar o conteúdo completo e atualizado de um arquivo de código, aplicando uma instrução. NÃO forneça explicações. NÃO forneça comandos de terminal. NÃO escreva nenhuma palavra além do código do arquivo.`;
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
      if (!response.ok) return "Desculpe, meu cérebro (Groq) está com problemas no momento.";
      const data = await response.json();
      return data.choices[0]?.message?.content || "Ocorreu um erro ao processar a resposta da IA.";
  },

  // --- FUNÇÕES DE SERVIÇOS EXTERNOS (MEMÓRIA, BRAÇOS, SERVIDOR) ---
  
  async getSupabaseUser(env, userId) {
    const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/clients?telegram_id=eq.${userId}&select=*`;
    const response = await fetch(supabaseUrl, { headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` } });
    if (!response.ok) return { data: null, error: true };
    const data = await response.json();
    return { data: data.length > 0 ? data[0] : null, error: false };
  },

  getBranchFromHost(env, hostname) {
    const repoName = env.GITHUB_REPO_URL.split('/')[1];
    const productionHost = `${repoName}.pages.dev`;
    if (hostname.endsWith(productionHost)) {
        const subdomain = hostname.replace(`.${productionHost}`, '');
        if (subdomain !== repoName && subdomain !== 'www' && subdomain.startsWith('ai-edit-')) { 
            return subdomain;
        }
    }
    return null;
  },

  async serveGithubFile(env, repo, filePath, branchName) {
    const cleanFilePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    const fileData = await this.getGithubFileContent(env, repo, cleanFilePath, true, branchName);
    if (fileData.error) return new Response(`Arquivo não encontrado: ${cleanFilePath}`, { status: 404 });
    const contentType = cleanFilePath.endsWith('.css') ? 'text/css' : cleanFilePath.endsWith('.js') ? 'application/javascript' : 'text/html;charset=utf-8';
    return new Response(fileData.content, { headers: { 'Content-Type': contentType } });
  },

  async getGithubFileContent(env, repo, filePath, getFullObject = false, branchName = 'master') {
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branchName}`;
    const response = await fetch(githubUrl, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' } });
    if (!response.ok) return getFullObject ? { error: true, message: `Arquivo não encontrado (${filePath}) ou token do GitHub inválido.` } : `Arquivo não encontrado: ${filePath}`;
    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    if (getFullObject) return { content, sha: data.sha, error: false };
    return content;
  },

  async updateGithubFile(env, repo, filePath, newContent, sha, commitMessage, branchName = 'master') {
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    const response = await fetch(githubUrl, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' },
        body: JSON.stringify({ message: commitMessage, content: Buffer.from(newContent).toString('base64'), sha, branch: branchName })
    });
    if (!response.ok) return { success: false, message: (await response.json()).message || 'Erro' };
    const data = await response.json();
    return { success: true, url: data.commit.html_url };
  },

  async getBranchSha(env, repo, branchName) {
    const url = `https://api.github.com/repos/${repo}/git/ref/heads/${branchName}`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' } });
    if (!response.ok) return null;
    const data

    const data = await response.json();
    return data.object.sha;
  },

  async createGithubBranch(env, repo, newBranchName, sha) {
    const url = `https://api.github.com/repos/${repo}/git/refs`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' },
        body: JSON.stringify({ ref: `refs/heads/${newBranchName}`, sha: sha })
    });
    return { success: response.ok, response: response };
  },

  async mergeBranchToMain(env, repo, branchName) {
    const url = `https://api.github.com/repos/${repo}/merges`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' },
        body: JSON.stringify({ base: 'master', head: branchName, commit_message: `Merge: aprova alteração de ${branchName}` })
    });
    if (response.status === 201) return `🚀 Aprovado! A alteração foi publicada no site principal.`;
    if (response.status === 204) return `✅ A alteração já está no site principal.`;
    const errorData = await response.json();
    return `❌ Falha ao aprovar. Erro: ${errorData.message}`;
  },
  
  async sendMessage(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }), });
  },
  async sendChatAction(token, chatId, action) {
    const url = `https://api.telegram.org/bot${token}/sendChatAction`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: action }), });
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

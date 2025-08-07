// VERSÃO COMPLETA: LÓGICA DE INTENÇÃO, PREVIEW, APROVAÇÃO E DEBUG GLOBAL

export default {
  async fetch(request, env, ctx) {
    // Colete salva-vidas: pega qualquer erro fatal que acontecer
    try {
      const url = new URL(request.url);
      
      if (url.pathname === '/telegram-webhook') {
        return this.handleTelegramWebhook(request, env, ctx);
      }
      if (url.pathname === '/setup') {
        return this.setupWebhook(request, env);
      }

      // Lógica para servir os arquivos do site (principal e previews)
      const branchName = this.getBranchFromHost(env, url.hostname) || 'master';
      const path = url.pathname === '/' ? '/teste.html' : url.pathname;
      return this.serveGithubFile(env, env.GITHUB_REPO_URL, path, branchName);

    } catch (e) {
      console.error(e);
      // Se algo quebrar, o erro aparece na tela do navegador
      return new Response(`Erro fatal no Worker:\n\nERRO: ${e.message}\n\nPILHA DE ERROS:\n${e.stack}`, { status: 500 });
    }
  },

  async handleTelegramWebhook(request, env, ctx) {
    if (request.method !== 'POST') return new Response('Método não permitido');
    try {
      const payload = await request.json();
      if (payload.message) {
        // Processa tudo em segundo plano para evitar timeout do Telegram
        ctx.waitUntil(this.processMessage(payload.message, env));
      }
      return new Response('OK'); // Responde OK imediatamente
    } catch (e) {
      console.error(e.stack);
      return new Response('Erro no webhook', { status: 500 });
    }
  },
  
  // O "Gerente de Projetos"
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
    
    // O Cérebro Intérprete entra em ação
    const intent = await this.getIntentWithAI(env, text);
    const GITHUB_REPO = env.GITHUB_REPO_URL;

    switch (intent.action) {
      case 'read_file':
        if (!intent.file_path) return await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Não entendi qual arquivo você quer ler.");
        const fileContent = await this.getGithubFileContent(env, GITHUB_REPO, intent.file_path, false, 'master');
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent.error ? fileContent.message : fileContent);
        break;

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

      case 'conversation':
      default:
        const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
        break;
    }
  },

  // O Cérebro Intérprete que entende o que você quer
  async getIntentWithAI(env, userInput) {
    const systemPrompt = `Analise a mensagem do usuário. Sua tarefa é extrair a intenção e entidades. Responda APENAS com um objeto JSON válido.
As ações (action) possíveis são: "read_file", "edit_file", "approve_change", "conversation".
- Se a ação for ler um arquivo (ex: 'leia o arquivo', 'me mostre o codigo'), use "read_file" e extraia o 'file_path'.
- Se a ação for editar um arquivo (ex: 'mude o titulo', 'adicione um botão'), use "edit_file" e extraia o 'file_path' e a 'instruction'.
- Se a ação for aprovar uma mudança (ex: 'pode aprovar', 'manda pro site'), use "approve_change" e extraia a 'branch_name'.
- Para todo o resto (saudações, perguntas), use "conversation".

Exemplos:
- User: "leia o arquivo teste.html" -> {"action": "read_file", "file_path": "teste.html"}
- User: "mude o h1 do teste.html para 'Olá'" -> {"action": "edit_file", "file_path": "teste.html", "instruction": "mude o h1 para 'Olá'"}
- User: "aprovar ai-edit-12345" -> {"action": "approve_change", "branch_name": "ai-edit-12345"}
- User: "tudo bem?" -> {"action": "conversation"}`;
    
    const responseText = await this.runGroq(env.GROQ_API_KEY, userInput, systemPrompt);
    try {
      return JSON.parse(responseText);
    } catch (e) {
      console.error("Erro ao interpretar a intenção da IA:", responseText);
      return { action: 'conversation' };
    }
  },

  // A lógica de edição segura com previews
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

  // Lógica para gerar o código novo com IA
  async generateNewContentWithAI(env, filePath, instruction, originalContent) {
    const systemPrompt = `Você é um sistema autônomo de desenvolvimento de software. Sua única tarefa é reescrever e retornar o conteúdo completo e atualizado de um arquivo de código, aplicando uma instrução. NÃO forneça explicações. NÃO forneça comandos de terminal. NÃO escreva nenhuma palavra além do código do arquivo. Sua resposta deve começar com a primeira linha do arquivo e terminar com a última.`;
    const userPrompt = `INSTRUÇÃO: "${instruction}"\n\nCONTEÚDO ATUAL DO ARQUIVO '${filePath}':\n\n\`\`\`\n${originalContent}\n\`\`\``;
    return this.runGroq(env.GROQ_API_KEY, userPrompt, systemPrompt);
  },

  // --- FUNÇÕES AUXILIARES DE API (GitHub, Supabase, etc.) ---

  async getSupabaseUser(env, userId) {
    const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/clients?telegram_id=eq.${userId}&select=*`;
    const response = await fetch(supabaseUrl, { headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` } });
    if (!response.ok) return { data: null, error: true };
    const data = await response.json();
    return { data: data.length > 0 ? data[0] : null, error: false };
  },

  async getBranchFromHost(env, hostname) {
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
    if (fileData.error) return new Response(`Arquivo não encontrado: ${cleanFilePath}`, { status: 404 });
    const contentType = cleanFilePath.endsWith('.css') ? 'text/css' : cleanFilePath.endsWith('.js') ? 'application/javascript' : 'text/html;charset=utf-8';
    return new Response(fileData.content, { headers: { 'Content-Type': contentType } });
  },

  async getGithubFileContent(env, repo, filePath, getFullObject = false, branchName = 'master') {
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branchName}`;
    const response = await fetch(githubUrl, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' } });
    if (!response.ok) return getFullObject ? { error: true, message: `Arquivo não encontrado: ${filePath}` } : `Arquivo não encontrado: ${filePath}`;
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

  async getBranchSha(env, repo, branchName) { /* ... */ },
  async createGithubBranch(env, repo, newBranchName, sha) { /* ... */ },
  async mergeBranchToMain(env, repo, branchName) { /* ... */ },
  async runGroq(apiKey, userInput, systemInput) { /* ... */ },
  async sendMessage(token, chatId, text) { /* ... */ },
  async sendChatAction(token, chatId, action) { /* ... */ },
  async setupWebhook(request, env) { /* ... */ }
};

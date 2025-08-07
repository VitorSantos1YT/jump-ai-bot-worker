// FASE 4 - VERSÃO FINAL CORRIGIDA E SEM DEPENDÊNCIAS

export default {
  async fetch(request, env, ctx) {
    // try...catch para segurança máxima
    try {
      const url = new URL(request.url);
      if (url.pathname === '/telegram-webhook') {
        return this.handleTelegramWebhook(request, env, ctx);
      }
      if (url.pathname === '/setup') {
        return this.setupWebhook(request, env);
      }
      return new Response('Assistente de IA está online. Fluxo de preview implementado.');
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

  // FUNÇÕES DE LÓGICA
  async safeEditFileWithAI(env, repo, filePath, instruction) {
    const mainBranchSha = await this.getBranchSha(env, repo, 'master');
    if (!mainBranchSha) return "❌ Não consegui encontrar a branch principal do projeto.";
    const originalFile = await this.getGithubFileContent(env, repo, filePath, true, 'master');
    if (originalFile.error) return originalFile.message;
    const newContent = await this.generateNewContentWithAI(env, filePath, instruction, originalFile.content);
    if (newContent.startsWith("Desculpe")) return newContent;
    const branchName = `ai-edit-${Date.now()}`;
    const createBranchResult = await this.createGithubBranch(env, repo, branchName, mainBranchSha);
    if (!createBranchResult.success) return `❌ Falha ao criar o ambiente de teste: ${createBranchResult.message}`;
    const commitResult = await this.updateGithubFile(env, repo, filePath, newContent, originalFile.sha, `feat: edita ${filePath} via IA`, branchName);
    if (commitResult.success) {
        const repoName = repo.split('/')[1];
        const previewUrl = `https://${branchName}--${repoName}.pages.dev`;
        return `✅ Criei um ambiente de teste.\n\n` +
               `👀 Veja como ficou: ${previewUrl}\n\n` +
               `👍 Para aprovar, responda com:\n` +
               `\`aprovar ${branchName}\``;
    } else {
        return `❌ Falha ao salvar no ambiente de teste.\nErro: ${commitResult.message}`;
    }
  },

  async generateNewContentWithAI(env, filePath, instruction, originalContent) {
    const systemPrompt = `Você é um dev web expert. Edite o arquivo a seguir com base na instrução. Retorne APENAS o conteúdo completo e atualizado do arquivo.`;
    const userPrompt = `INSTRUÇÃO: "${instruction}"\n\nCONTEÚDO ATUAL DO ARQUIVO '${filePath}':\n\n${originalContent}`;
    return this.runGroq(env.GROQ_API_KEY, userPrompt, systemPrompt);
  },

  // FUNÇÕES DE API (GITHUB, SUPABASE, GROQ, TELEGRAM)
  async getBranchSha(env, repo, branchName) {
    const url = `https://api.github.com/repos/${repo}/git/ref/heads/${branchName}`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' } });
    if (!response.ok) return null;
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
    return { success: response.ok, message: response.statusText };
  },

  async mergeBranchToMain(env, repo, branchName) {
    const url = `https://api.github.com/repos/${repo}/merges`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' },
            body: JSON.stringify({ base: 'master', head: branchName, commit_message: `Merge: aprova alteração de ${branchName}` })
        });
        if (response.status === 201) return `🚀 Aprovado! Publicado no site principal.`;
        if (response.status === 204) return `✅ Alteração já está no site principal.`;
        const errorData = await response.json();
        return `❌ Falha ao aprovar. Erro: ${errorData.message}`;
    } catch (e) { return `❌ Erro de rede ao tentar aprovar.`; }
  },
  
  async updateGithubFile(env, repo, filePath, newContent, sha, commitMessage, branchName = 'master') {
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    try {
        const response = await fetch(githubUrl, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' },
            body: JSON.stringify({ message: commitMessage, content: btoa(newContent), sha: sha, branch: branchName })
        });
        if (!response.ok) {
            const errorData = await response.json();
            return { success: false, message: errorData.message || 'Erro' };
        }
        const data = await response.json();
        return { success: true, url: data.commit.html_url };
    } catch (e) { return { success: false, message: e.message }; }
  },
  
  async getGithubFileContent(env, repo, filePath, getFullObject = false, branchName = 'master') {
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branchName}`;
    try {
      const response = await fetch(githubUrl, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' } });
      if (!response.ok) return getFullObject ? { error: true, message: `Arquivo não encontrado. Status: ${response.status}` } : `Arquivo não encontrado: ${filePath}`;
      const data = await response.json();
      const content = atob(data.content);
      if (getFullObject) return { content, sha: data.sha, error: false };
      return `Conteúdo de '${filePath}':\n\n${content.substring(0, 1000)}...`;
    } catch (e) { return getFullObject ? { error: true, message: "Erro ao ler GitHub." } : "Erro ao ler GitHub."; }
  },

  // CÓDIGO CORRIGIDO PARA USAR FETCH NATIVO COM O SUPABASE
  async getSupabaseUser(env, userId) {
    const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/clients?telegram_id=eq.${userId}&select=*`;
    try {
        const response = await fetch(supabaseUrl, {
            headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
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
  
  async runGroq(apiKey, userInput, systemInput = "Você é Jump.ai.") {
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

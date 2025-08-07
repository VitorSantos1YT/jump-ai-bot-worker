// FASE 3: IMPLEMENTANDO A ESCRITA NO GITHUB

import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js';

export default {
  async fetch(request, env, ctx) {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    const url = new URL(request.url);
    if (url.pathname === '/telegram-webhook') {
      return this.handleTelegramWebhook(request, env, ctx);
    }
    if (url.pathname === '/setup') {
      return this.setupWebhook(request, env);
    }
    return new Response('Assistente de IA está online. Memória e Braços (Leitura/Escrita) conectados.');
  },

  async handleTelegramWebhook(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Método não permitido', { status: 405 });
    }
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
        const errorMessage = client.error ? "Desculpe, estou com problemas na minha memória (Supabase)." : `Acesso negado. Seu ID (${userId}) não está registrado.`;
        return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
    }

    await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
    
    const GITHUB_REPO = env.GITHUB_REPO_URL;

    // --- NOVA LÓGICA DE COMANDOS ---
    if (text.toLowerCase().startsWith('ler arquivo')) {
        const filePath = text.substring(12).trim();
        const fileContent = await this.getGithubFileContent(env, GITHUB_REPO, filePath);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent);

    } else if (text.toLowerCase().startsWith('editar arquivo')) {
        // Exemplo: editar arquivo index.html "mude o título para Olá Mundo"
        const parts = text.substring(15).trim().split('"');
        const filePath = parts[0].trim();
        const instruction = parts[1];

        if (!filePath || !instruction) {
            return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Formato inválido. Use: editar arquivo [nome do arquivo] \"[instrução]\"");
        }
        
        const response = await this.editFileWithAI(env, GITHUB_REPO, filePath, instruction);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, response);

    } else {
        const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
    }
  },

  /**
   * NOVO: Orquestra o processo de edição de um arquivo
   */
  async editFileWithAI(env, repo, filePath, instruction) {
    // 1. Lê o conteúdo atual do arquivo
    const originalContent = await this.getGithubFileContent(env, repo, filePath, true); // true para obter o conteúdo completo
    if (originalContent.error) {
        return originalContent.message;
    }
    
    // 2. Monta o prompt para a IA
    const systemPrompt = `Você é um desenvolvedor web expert. Sua tarefa é editar o arquivo a seguir com base na instrução do usuário. Retorne APENAS o conteúdo completo e atualizado do arquivo. Não inclua nenhuma explicação, apenas o código.`;
    const userPrompt = `INSTRUÇÃO: "${instruction}"\n\nCONTEÚDO ATUAL DO ARQUIVO '${filePath}':\n\n${originalContent.content}`;

    // 3. Pede para a IA gerar o novo código
    const newContent = await this.runGroq(env.GROQ_API_KEY, userPrompt, systemPrompt);

    // 4. Salva o novo conteúdo no GitHub
    const commitResult = await this.updateGithubFile(env, repo, filePath, newContent, originalContent.sha, `feat: edita ${filePath} via IA`);

    if (commitResult.success) {
        return `✅ Arquivo '${filePath}' atualizado com sucesso!\nVeja a alteração aqui: ${commitResult.url}`;
    } else {
        return `❌ Falha ao salvar o arquivo '${filePath}'.\nErro: ${commitResult.message}`;
    }
  },

  async getGithubFileContent(env, repo, filePath, getFullObject = false) {
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    try {
      const response = await fetch(githubUrl, {
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' }
      });
      if (!response.ok) {
        return getFullObject ? { error: true, message: `Arquivo não encontrado. Status: ${response.status}` } : `Arquivo não encontrado: ${filePath}`;
      }
      const data = await response.json();
      const content = atob(data.content);
      if (getFullObject) {
        return { content: content, sha: data.sha };
      }
      return `Conteúdo de '${filePath}':\n\n${content.substring(0, 1000)}...`;
    } catch (e) { return getFullObject ? { error: true, message: "Erro ao ler o GitHub." } : "Erro ao ler o GitHub."; }
  },

  /**
   * NOVO: Salva (faz commit) de um arquivo no GitHub
   */
  async updateGithubFile(env, repo, filePath, newContent, sha, commitMessage) {
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    try {
        const response = await fetch(githubUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
                'User-Agent': 'JumpAI-Bot',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                message: commitMessage,
                content: btoa(newContent), // Codifica o novo conteúdo para base64
                sha: sha // O 'sha' é necessário para provar que estamos atualizando a versão mais recente
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            return { success: false, message: errorData.message || 'Erro desconhecido' };
        }
        const data = await response.json();
        return { success: true, url: data.commit.html_url };
    } catch (e) {
        return { success: false, message: e.message };
    }
  },

  async getSupabaseUser(env, userId) { /* ...código anterior... */ 
    const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/clients?telegram_id=eq.${userId}&select=*`;
    try {
        const response = await fetch(supabaseUrl, { headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` } });
        if (!response.ok) return { data: null, error: true };
        const data = await response.json();
        return { data: data.length > 0 ? data[0] : null, error: false };
    } catch (e) { return { data: null, error: true }; }
  },
  async runGroq(apiKey, userInput, systemInput = "Você é Jump.ai. Responda de forma concisa e útil.") { /* ...código anterior... */ 
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
  async sendMessage(token, chatId, text) { /* ...código anterior... */ 
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }), });
  },
  async sendChatAction(token, chatId, action) { /* ...código anterior... */ 
    const url = `https://api.telegram.org/bot${token}/sendChatAction`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: action }), });
  },
  async setupWebhook(request, env) { /* ...código anterior... */ 
    const workerUrl = `https://${new URL(request.url).hostname}`;
    const webhookUrl = `${workerUrl}/telegram-webhook`;
    const telegramApiUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
    const response = await fetch(telegramApiUrl);
    const result = await response.json();
    return new Response(`Webhook configurado para: ${webhookUrl}\n\nResposta do Telegram: ${JSON.stringify(result)}`);
  }
};

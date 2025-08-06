// ARQUITETURA FINAL - SEM DEPENDÊNCIAS EXTERNAS

export default {
  async fetch(request, env) {
    // Não precisamos mais inicializar o cliente do Supabase aqui.
    const url = new URL(request.url);
    if (url.pathname === '/telegram-webhook') {
      return this.handleTelegramWebhook(request, env);
    }
    if (url.pathname === '/setup') {
      return this.setupWebhook(request, env);
    }
    return new Response('Assistente de IA está online. Arquitetura sem dependências.');
  },

  async handleTelegramWebhook(request, env) {
    if (request.method !== 'POST') {
      return new Response('Método não permitido', { status: 405 });
    }
    try {
      const payload = await request.json();
      if (payload.message) {
        const message = payload.message;
        const chatId = message.chat.id;
        const userId = message.from.id;
        const text = message.text || '(Mensagem não textual)';

        console.log(`Mensagem de ${userId}: ${text}`);
        
        // 1. VERIFICAR A IDENTIDADE DO USUÁRIO USANDO FETCH
        const client = await this.getSupabaseUser(env, userId);

        if (client.error) {
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Desculpe, estou com problemas na minha memória (Supabase).");
            return new Response('OK');
        }

        if (!client.data) {
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Acesso negado. Seu ID (${userId}) não está registrado no meu sistema.`);
            return new Response('OK');
        }

        await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
        
        // 2. INTERPRETAR O COMANDO
        const GITHUB_REPO = env.GITHUB_REPO_URL;

        if (text.toLowerCase().startsWith('ler arquivo')) {
            const filePath = text.substring(12).trim();
            const fileContent = await this.getGithubFileContent(env, GITHUB_REPO, filePath);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent);
        } else {
            const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
        }
      }
      return new Response('OK');
    } catch (e) {
      console.error(e.stack);
      return new Response('Erro interno do worker', { status: 500 });
    }
  },
  
  /**
   * NOVO: Busca o usuário no Supabase usando fetch nativo
   */
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
        // Se a resposta for um array vazio, o usuário não existe.
        return { data: data.length > 0 ? data[0] : null, error: false };
    } catch (e) {
        console.error("Erro ao conectar com Supabase:", e);
        return { data: null, error: true };
    }
  },

  async getGithubFileContent(env, repo, filePath) {
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    // ... (esta função e as outras abaixo permanecem iguais)
    try {
      const response = await fetch(githubUrl, {
        headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot', 'Accept': 'application/vnd.github.v3+json' }
      });
      if (!response.ok) return `Não consegui ler o arquivo '${filePath}'. Status: ${response.status}.`;
      const data = await response.json();
      const content = atob(data.content);
      return `Conteúdo do arquivo '${filePath}':\n\n${content.substring(0, 1000)}...`;
    } catch (e) { return "Ocorreu um erro ao tentar ler o GitHub."; }
  },

  async runGroq(apiKey, userInput) {
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const systemPrompt = "Você é Jump.ai, o cérebro de um sistema de IA que edita sites. O usuário com quem você está falando é um cliente autenticado. Seja prestativo e direto.";
      // ... (código do Groq permanece igual)
      const response = await fetch(groqUrl, { 
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
              messages: [ { role: "system", content: systemPrompt }, { role: "user", content: userInput } ],
              model: "llama3-70b-8192"
          })
      });
      if (!response.ok) return "Desculpe, meu cérebro (Groq) está com problemas.";
      const data = await response.json();
      return data.choices[0].message.content;
  },
  
  async sendMessage(token, chatId, text) {
    const url = `https:/api.telegram.org/bot${token}/sendChatAction`;
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

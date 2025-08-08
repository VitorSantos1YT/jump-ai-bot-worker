// VERSÃO DE RESTAURAÇÃO - BASE ESTÁVEL E FUNCIONAL

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
      return new Response('Assistente de IA está online. Operando em modo estável.');
    } catch (e) {
      return new Response(`Erro fatal no Worker:\n${e.message}`, { status: 500 });
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
      console.error(e.stack);
      return new Response('Erro no webhook', { status: 500 });
    }
  },

  async processMessage(message, env) {
    const chatId = message.chat.id;
    const userId = message.from.id.toString();
    const text = message.text || '(Mensagem não textual)';

    const client = await this.getSupabaseUser(env, userId);
    if (client.error || !client.data) {
        const errorMessage = client.error ? "Desculpe, estou com problemas na minha memória (Supabase)." : `Acesso negado. Seu ID (${userId}) não está na minha lista.`;
        return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
    }
    
    await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
    
    const GITHUB_REPO = env.GITHUB_REPO_URL;
    const lowerCaseText = text.toLowerCase();

    if (lowerCaseText.startsWith('ler arquivo') || lowerCaseText.startsWith('leia o arquivo')) {
        const filePath = text.split(/ler arquivo|leia o arquivo/i)[1].trim();
        const fileContent = await this.getGithubFileContent(env, GITHUB_REPO, filePath);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent);
    } else {
        const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
    }
  },
  
  async getSupabaseUser(env, userId) {
    const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/clients?telegram_id=eq.${userId}&select=*`;
    try {
        const response = await fetch(supabaseUrl, {
            headers: {
                'apikey': env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`
            }
        });
        if (!response.ok) return { data: null, error: true };
        const data = await response.json();
        return { data: data.length > 0 ? data[0] : null, error: false };
    } catch (e) { return { data: null, error: true }; }
  },

  async getGithubFileContent(env, repo, filePath) {
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    try {
      const response = await fetch(githubUrl, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' } });
      if (!response.ok) return `Arquivo não encontrado ou erro de permissão: ${filePath} (Status: ${response.status})`;
      const data = await response.json();
      const content = Buffer.from(data.content, 'base64').toString('utf8');
      return `Conteúdo de '${filePath}':\n\n${content.substring(0, 1000)}...`;
    } catch (e) {
      console.error("Erro na função getGithubFileContent:", e);
      return "Ocorreu um erro ao tentar ler o arquivo no GitHub.";
    }
  },

  async runGroq(apiKey, userInput) {
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const systemPrompt = "Você é Jump.ai. Responda de forma concisa e útil.";
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

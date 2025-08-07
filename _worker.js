// FASE 3.6 - REFINAMENTO DE INTENÇÃO E CORREÇÃO DE ENCODING

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
      return new Response('Assistente de IA está online. Refinamento final implementado.');
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
        const errorMessage = client.error ? "Desculpe, estou com problemas na minha memória." : `Acesso negado. Seu ID (${userId}) não está registrado.`;
        return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
    }
    
    await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
    
    const intent = await this.getIntentWithAI(env, text);
    const GITHUB_REPO = env.GITHUB_REPO_URL;

    switch (intent.action) {
      case 'read_file':
        if (!intent.file_path) {
          await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Entendi que você quer ler um arquivo, mas não consegui identificar qual.");
          break;
        }
        const fileContent = await this.getGithubFileContent(env, GITHUB_REPO, intent.file_path);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent);
        break;
      
      case 'conversation':
      default:
        const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
        break;
    }
  },

  async getIntentWithAI(env, userInput) {
    const systemPrompt = `Analise a mensagem do usuário. Sua tarefa é extrair a intenção e as entidades. Responda APENAS com um objeto JSON válido. As ações possíveis são: "read_file", "edit_file", "approve_change", "conversation". Se for uma saudação simples (oi, olá, opa, tudo bem), uma pergunta genérica ou se não tiver certeza, a ação é SEMPRE "conversation". Se a ação for "read_file" ou "edit_file", extraia o caminho do arquivo (file_path). Exemplo: User: "lee o arquivo teste.html" -> {"action": "read_file", "file_path": "teste.html"}`;
    const responseText = await this.runGroq(env.GROQ_API_KEY, userInput, systemPrompt);
    try {
      return JSON.parse(responseText);
    } catch (e) {
      console.error("Erro ao interpretar a intenção da IA:", responseText);
      return { action: 'conversation' };
    }
  },
  
  async getSupabaseUser(env, userId) {
    const supabaseUrl = `${env.SUPABASE_URL}/rest/v1/clients?telegram_id=eq.${userId}&select=*`;
    try {
        const response = await fetch(supabaseUrl, { headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}` } });
        if (!response.ok) return { data: null, error: true };
        const data = await response.json();
        return { data: data.length > 0 ? data[0] : null, error: false };
    } catch (e) { return { data: null, error: true }; }
  },

  async getGithubFileContent(env, repo, filePath) {
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    try {
      const response = await fetch(githubUrl, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' } });
      if (!response.ok) return `Arquivo não encontrado: ${filePath}`;
      const data = await response.json();
      
      // --- CORREÇÃO DO ENCODING ---
      // Usamos TextDecoder para garantir a leitura correta de UTF-8
      const base64 = data.content;
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const content = new TextDecoder('utf-8').decode(bytes);
      // --- FIM DA CORREÇÃO ---

      return `Conteúdo de '${filePath}':\n\n${content.substring(0, 1000)}...`;
    } catch (e) { return "Erro ao ler o GitHub."; }
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
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content;
      }
      return "Ocorreu um erro ao processar a resposta da IA.";
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

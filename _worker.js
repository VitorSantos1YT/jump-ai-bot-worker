// MUDANÇA AQUI: Trocamos o provedor do módulo para skypack.dev
import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js';

export default {
  async fetch(request, env) {
    // Inicializa o cliente do Supabase uma única vez para cada requisição
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
    
    const url = new URL(request.url);
    if (url.pathname === '/telegram-webhook') {
      return this.handleTelegramWebhook(request, env);
    }
    if (url.pathname === '/setup') {
      return this.setupWebhook(request, env);
    }
    return new Response('Assistente de IA está online. Memória e Braços conectados.');
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
        
        // 1. VERIFICAR A IDENTIDADE DO USUÁRIO
        const { data: client, error } = await this.supabase
          .from('clients')
          .select('*')
          .eq('telegram_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') {
            console.error("Erro no Supabase:", error);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Desculpe, estou com problemas na minha memória (Supabase).");
            return new Response('OK');
        }

        if (!client) {
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

  async getGithubFileContent(env, repo, filePath) {
    const githubUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    try {
      const response = await fetch(githubUrl, {
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'User-Agent': 'JumpAI-Bot',
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (!response.ok) {
        return `Não consegui ler o arquivo '${filePath}'. Status: ${response.status}. Verifique se o nome do repositório e do arquivo estão corretos.`;
      }
      const data = await response.json();
      const content = atob(data.content);
      return `Conteúdo do arquivo '${filePath}':\n\n${content.substring(0, 1000)}... (mostrando os primeiros 1000 caracteres)`;
    } catch (e) {
      console.error("Erro ao ler arquivo do GitHub:", e);
      return "Ocorreu um erro ao tentar usar meus 'braços' para ler o GitHub.";
    }
  },

  async runGroq(apiKey, userInput) {
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const systemPrompt = "Você é Jump.ai, o cérebro de um sistema de IA que edita sites. O usuário com quem você está falando é um cliente autenticado. Seja prestativo e direto.";
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/telegram-webhook') {
      return this.handleTelegramWebhook(request, env);
    }
    if (url.pathname === '/setup') {
      return this.setupWebhook(request, env);
    }
    return new Response('Assistente de IA está online. Cérebro principal conectado.');
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
        
        // Avisa ao usuário que está pensando (melhora a experiência)
        await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');

        // Chama a IA (nosso especialista rápido) para gerar uma resposta
        const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
        
        // Envia a resposta da IA de volta para o Telegram
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
      }
      return new Response('OK');
    } catch (e) {
      console.error(e.stack);
      // Em caso de erro, avisa o usuário no Telegram
      try {
        const payload = await request.json();
        if (payload.message) {
          await this.sendMessage(env.TELEGRAM_BOT_TOKEN, payload.message.chat.id, "Ocorreu um erro interno no meu cérebro. Tente novamente.");
        }
      } catch (err) {
        console.error("Erro ao notificar o usuário sobre o erro:", err);
      }
      return new Response('Erro interno do worker', { status: 500 });
    }
  },

  /**
   * Executa o Llama 4 via API do Groq
   */
  async runGroq(apiKey, userInput) {
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const systemPrompt = "Você é Jump.ai, um assistente de IA amigável e direto. Você é um especialista em desenvolvimento web e IA. Responda as perguntas do usuário de forma concisa e útil.";

      try {
        const response = await fetch(groqUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userInput }
                ],
                model: "llama3-70b-8192" // Usando o modelo Llama 3 70B, o mais potente no Groq
            })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Erro na API do Groq: ${response.status} ${response.statusText}`, errorBody);
            return "Desculpe, meu cérebro principal (Groq) parece estar offline ou com problemas no momento.";
        }

        const data = await response.json();
        return data.choices[0].message.content;
      } catch (e) {
        console.error("Erro ao conectar com a API do Groq:", e);
        return "Desculpe, não consegui me conectar ao meu cérebro principal (Groq). Verifique a conexão.";
      }
  },
  
  async sendMessage(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  },

  /**
   * Envia o status "digitando..." para o Telegram
   */
  async sendChatAction(token, chatId, action) {
    const url = `https://api.telegram.org/bot${token}/sendChatAction`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: action }),
    });
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

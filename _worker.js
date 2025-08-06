export default { async fetch(request, env) { const url = new 
    URL(request.url);
    // Rota para o Telegram nos enviar atualizações (o webhook)
    if (url.pathname === '/telegram-webhook') { return 
      this.handleTelegramWebhook(request, env);
    }
    // Rota para configurarmos o bot (só usamos uma vez)
    if (url.pathname === '/setup') { return 
      this.setupWebhook(request, env);
    }
    // Resposta padrão para qualquer outra visita ao site
    return new Response('Assistente de IA está online e 
    operando.');
  },
  /** * Lida com as mensagens recebidas do Telegram */ async 
  handleTelegramWebhook(request, env) {
    // Apenas requisições POST são permitidas pelo Telegram
    if (request.method !== 'POST') { return new Response('Método 
      não permitido', { status: 405 });
    }
    try { const payload = await request.json();
      // Verificamos se a mensagem existe no payload
      if (payload.message) { const message = payload.message; const 
        chatId = message.chat.id; const userId = message.from.id; 
        const text = message.text || '(Mensagem não textual 
        recebida)';
        // LOGGING: Isso nos ajuda a ver no painel da Cloudflare o 
        // que está acontecendo
        console.log(`Mensagem recebida de ${userId} no chat 
        ${chatId}: ${text}`);
        // Futuramente, aqui entrará a lógica do "Agente Mestre" 
        // Por enquanto, apenas confirmamos que recebemos a 
        // mensagem e que as chaves funcionam.
        const responseText = `Recebido! Seu ID de usuário é 
        ${userId}. A conexão com o Telegram está funcionando. Chave 
        do Groq carregada: ${env.GROQ_API_KEY ? 'Sim' : 'Não'}. 
        Banco de dados conectado: ${env.SUPABASE_URL ? 'Sim' : 
        'Não'}.`; await this.sendMessage(env.TELEGRAM_BOT_TOKEN, 
        chatId, responseText);
      }
      return new Response('OK'); // Respondemos OK para o Telegram
    } catch (e) {
      console.error(e.stack); return new Response('Erro interno do 
      worker', { status: 500 });
    }
  },
  /** * Envia uma mensagem de volta para o Telegram */ async 
  sendMessage(token, chatId, text) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`; 
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  },
  /** * Registra nosso webhook no Telegram (só precisa ser 
   executado uma vez) */
  async setupWebhook(request, env) {
    // Pega a URL do nosso worker a partir da requisição
    const workerUrl = `https://${new URL(request.url).hostname}`; 
    const webhookUrl = `${workerUrl}/telegram-webhook`;
    // Monta a URL da API do Telegram para registrar nosso bot
    const telegramApiUrl = 
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`; 
    const response = await fetch(telegramApiUrl); const result = 
    await response.json();
    // Retorna a resposta do Telegram para sabermos se deu certo
    return new Response(`Webhook configurado para: 
    ${webhookUrl}\n\nResposta do Telegram: 
    ${JSON.stringify(result)}`);
  }
};

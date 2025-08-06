// Importa o cliente do Supabase diretamente de um CDN.
// Esta é a forma correta de usar bibliotecas externas em um Cloudflare Worker sem build steps.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export default {
  async fetch(request, env) {
    // Inicializa o cliente do Supabase uma única vez
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
        
        // --- INÍCIO DA LÓGICA DA FASE 3 ---

        // 1. VERIFICAR A IDENTIDADE DO USUÁRIO
        const { data: client, error } = await this.supabase
          .from('clients')
          .select('*')
          .eq('telegram_id', userId)
          .single(); // .single() pega apenas um resultado ou nenhum

        if (error && error.code !== 'PGRST116') { // Ignora o erro "nenhuma linha encontrada"
            console.error("Erro no Supabase:", error);
            return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Desculpe, estou com problemas na minha memória (Supabase).");
        }

        // Se o cliente não for encontrado, ele não tem permissão.
        if (!client) {
            return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Acesso negado. Seu ID (${userId}) não está registrado no meu sistema.`);
        }

        // Se chegamos aqui, o usuário está autenticado.
        await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
        
        // 2. INTERPRETAR O COMANDO
        if (text.toLowerCase().startsWith('ler arquivo')) {
            const filePath = text.substring(12).trim(); // Pega o nome do arquivo depois de "ler arquivo "
            const fileContent = await this.getGithubFileContent(env, filePath);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent);
        } else {
            // Se não for um comando conhecido, conversamos com a IA
            const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
        }

        // --- FIM DA LÓGICA DA FASE 3 ---
      }
      return new Response('OK');
    } catch (e) {
      console.error(e.stack);
      return new Response('Erro interno do worker', { status: 500 });
    }
  },

  /**
   * NOVO: Lê o conteúdo de um arquivo do GitHub
   */
  async getGithubFileContent(env, filePath) {
    const repo = "VitorSantos1YT/jump-ai-bot-worker"; // Altere se o repositório for outro
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
        return `Não consegui ler o arquivo '${filePath}'. Status: ${response.status}. Verifique se o nome está correto.`;
      }
      const data = await response.json();
      // O conteúdo vem em base64, precisamos decodificar.
      const content = atob(data.content);
      return `Conteúdo do arquivo '${filePath}':\n\n${content.substring(0, 500)}... (mostrando os primeiros 500 caracteres)`;
    } catch (e) {
      console.error("Erro ao ler arquivo do GitHub:", e);
      return "Ocorreu um erro ao tentar usar meus 'braços' para ler o GitHub.";
    }
  },

  async runGroq(apiKey, userInput) {
      // ... (código do runGroq é o mesmo da Fase 2)
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const systemPrompt = "Você é Jump.ai, o cérebro de um sistema de IA que edita sites. O usuário com quem você está falando é um cliente autenticado. Seja prestativo e direto.";
      const response = await fetch(groqUrl, { /* ... corpo da requisição ... */ 
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
  
  // ... (sendMessage, sendChatAction, setupWebhook são os mesmos da Fase 2)
  async sendMessage(token, chatId, text) { /* ... */ 
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }), });
  },
  async sendChatAction(token, chatId, action) { /* ... */ 
    const url = `https://api.telegram.org/bot${token}/sendChatAction`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: action }), });
  },
  async setupWebhook(request, env) { /* ... */ 
    const workerUrl = `https://${new URL(request.url).hostname}`;
    const webhookUrl = `${workerUrl}/telegram-webhook`;
    const telegramApiUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
    const response = await fetch(telegramApiUrl);
    const result = await response.json();
    return new Response(`Webhook configurado para: ${webhookUrl}\n\nResposta do Telegram: ${JSON.stringify(result)}`);
  }
};
cat > _worker.js <<'EOL'
// Importa o cliente do Supabase diretamente de um CDN.
// Esta é a forma correta de usar bibliotecas externas em um Cloudflare Worker sem build steps.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export default {
  async fetch(request, env) {
    // Inicializa o cliente do Supabase uma única vez
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
        
        // --- INÍCIO DA LÓGICA DA FASE 3 ---

        // 1. VERIFICAR A IDENTIDADE DO USUÁRIO
        const { data: client, error } = await this.supabase
          .from('clients')
          .select('*')
          .eq('telegram_id', userId)
          .single(); // .single() pega apenas um resultado ou nenhum

        if (error && error.code !== 'PGRST116') { // Ignora o erro "nenhuma linha encontrada"
            console.error("Erro no Supabase:", error);
            return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Desculpe, estou com problemas na minha memória (Supabase).");
        }

        // Se o cliente não for encontrado, ele não tem permissão.
        if (!client) {
            return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Acesso negado. Seu ID (${userId}) não está registrado no meu sistema.`);
        }

        // Se chegamos aqui, o usuário está autenticado.
        await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
        
        // 2. INTERPRETAR O COMANDO
        if (text.toLowerCase().startsWith('ler arquivo')) {
            const filePath = text.substring(12).trim(); // Pega o nome do arquivo depois de "ler arquivo "
            const fileContent = await this.getGithubFileContent(env, filePath);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent);
        } else {
            // Se não for um comando conhecido, conversamos com a IA
            const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
        }

        // --- FIM DA LÓGICA DA FASE 3 ---
      }
      return new Response('OK');
    } catch (e) {
      console.error(e.stack);
      return new Response('Erro interno do worker', { status: 500 });
    }
  },

  /**
   * NOVO: Lê o conteúdo de um arquivo do GitHub
   */
  async getGithubFileContent(env, filePath) {
    const repo = "VitorSantos1YT/jump-ai-bot-worker"; // Altere se o repositório for outro
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
        return `Não consegui ler o arquivo '${filePath}'. Status: ${response.status}. Verifique se o nome está correto.`;
      }
      const data = await response.json();
      // O conteúdo vem em base64, precisamos decodificar.
      const content = atob(data.content);
      return `Conteúdo do arquivo '${filePath}':\n\n${content.substring(0, 500)}... (mostrando os primeiros 500 caracteres)`;
    } catch (e) {
      console.error("Erro ao ler arquivo do GitHub:", e);
      return "Ocorreu um erro ao tentar usar meus 'braços' para ler o GitHub.";
    }
  },

  async runGroq(apiKey, userInput) {
      // ... (código do runGroq é o mesmo da Fase 2)
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const systemPrompt = "Você é Jump.ai, o cérebro de um sistema de IA que edita sites. O usuário com quem você está falando é um cliente autenticado. Seja prestativo e direto.";
      const response = await fetch(groqUrl, { /* ... corpo da requisição ... */ 
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
  
  // ... (sendMessage, sendChatAction, setupWebhook são os mesmos da Fase 2)
  async sendMessage(token, chatId, text) { /* ... */ 
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }), });
  },
  async sendChatAction(token, chatId, action) { /* ... */ 
    const url = `https://api.telegram.org/bot${token}/sendChatAction`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: action }), });
  },
  async setupWebhook(request, env) { /* ... */ 
    const workerUrl = `https://${new URL(request.url).hostname}`;
    const webhookUrl = `${workerUrl}/telegram-webhook`;
    const telegramApiUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
    const response = await fetch(telegramApiUrl);
    const result = await response.json();
    return new Response(`Webhook configurado para: ${webhookUrl}\n\nResposta do Telegram: ${JSON.stringify(result)}`);
  }
};

cat > _worker.js <<'EOL'
// Importa o cliente do Supabase diretamente de um CDN.
// Esta é a forma correta de usar bibliotecas externas em um Cloudflare Worker sem build steps.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export default {
  async fetch(request, env) {
    // Inicializa o cliente do Supabase uma única vez
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
        
        // --- INÍCIO DA LÓGICA DA FASE 3 ---

        // 1. VERIFICAR A IDENTIDADE DO USUÁRIO
        const { data: client, error } = await this.supabase
          .from('clients')
          .select('*')
          .eq('telegram_id', userId)
          .single(); // .single() pega apenas um resultado ou nenhum

        if (error && error.code !== 'PGRST116') { // Ignora o erro "nenhuma linha encontrada"
            console.error("Erro no Supabase:", error);
            return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Desculpe, estou com problemas na minha memória (Supabase).");
        }

        // Se o cliente não for encontrado, ele não tem permissão.
        if (!client) {
            return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Acesso negado. Seu ID (${userId}) não está registrado no meu sistema.`);
        }

        // Se chegamos aqui, o usuário está autenticado.
        await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
        
        // 2. INTERPRETAR O COMANDO
        if (text.toLowerCase().startsWith('ler arquivo')) {
            const filePath = text.substring(12).trim(); // Pega o nome do arquivo depois de "ler arquivo "
            const fileContent = await this.getGithubFileContent(env, filePath);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent);
        } else {
            // Se não for um comando conhecido, conversamos com a IA
            const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
        }

        // --- FIM DA LÓGICA DA FASE 3 ---
      }
      return new Response('OK');
    } catch (e) {
      console.error(e.stack);
      return new Response('Erro interno do worker', { status: 500 });
    }
  },

  /**
   * NOVO: Lê o conteúdo de um arquivo do GitHub
   */
  async getGithubFileContent(env, filePath) {
    const repo = "VitorSantos1YT/jump-ai-bot-worker"; // Altere se o repositório for outro
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
        return `Não consegui ler o arquivo '${filePath}'. Status: ${response.status}. Verifique se o nome está correto.`;
      }
      const data = await response.json();
      // O conteúdo vem em base64, precisamos decodificar.
      const content = atob(data.content);
      return `Conteúdo do arquivo '${filePath}':\n\n${content.substring(0, 500)}... (mostrando os primeiros 500 caracteres)`;
    } catch (e) {
      console.error("Erro ao ler arquivo do GitHub:", e);
      return "Ocorreu um erro ao tentar usar meus 'braços' para ler o GitHub.";
    }
  },

  async runGroq(apiKey, userInput) {
      // ... (código do runGroq é o mesmo da Fase 2)
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const systemPrompt = "Você é Jump.ai, o cérebro de um sistema de IA que edita sites. O usuário com quem você está falando é um cliente autenticado. Seja prestativo e direto.";
      const response = await fetch(groqUrl, { /* ... corpo da requisição ... */ 
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
  
  // ... (sendMessage, sendChatAction, setupWebhook são os mesmos da Fase 2)
  async sendMessage(token, chatId, text) { /* ... */ 
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }), });
  },
  async sendChatAction(token, chatId, action) { /* ... */ 
    const url = `https://api.telegram.org/bot${token}/sendChatAction`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: action }), });
  },
  async setupWebhook(request, env) { /* ... */ 
    const workerUrl = `https://${new URL(request.url).hostname}`;
    const webhookUrl = `${workerUrl}/telegram-webhook`;
    const telegramApiUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
    const response = await fetch(telegramApiUrl);
    const result = await response.json();
    return new Response(`Webhook configurado para: ${webhookUrl}\n\nResposta do Telegram: ${JSON.stringify(result)}`);
  }
};
cat > _worker.js <<'EOL'
// Importa o cliente do Supabase diretamente de um CDN.
// Esta é a forma correta de usar bibliotecas externas em um Cloudflare Worker sem build steps.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export default {
  async fetch(request, env) {
    // Inicializa o cliente do Supabase uma única vez
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
        
        // --- INÍCIO DA LÓGICA DA FASE 3 ---

        // 1. VERIFICAR A IDENTIDADE DO USUÁRIO
        const { data: client, error } = await this.supabase
          .from('clients')
          .select('*')
          .eq('telegram_id', userId)
          .single(); // .single() pega apenas um resultado ou nenhum

        if (error && error.code !== 'PGRST116') { // Ignora o erro "nenhuma linha encontrada"
            console.error("Erro no Supabase:", error);
            return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Desculpe, estou com problemas na minha memória (Supabase).");
        }

        // Se o cliente não for encontrado, ele não tem permissão.
        if (!client) {
            return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Acesso negado. Seu ID (${userId}) não está registrado no meu sistema.`);
        }

        // Se chegamos aqui, o usuário está autenticado.
        await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
        
        // 2. INTERPRETAR O COMANDO
        if (text.toLowerCase().startsWith('ler arquivo')) {
            const filePath = text.substring(12).trim(); // Pega o nome do arquivo depois de "ler arquivo "
            const fileContent = await this.getGithubFileContent(env, filePath);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent);
        } else {
            // Se não for um comando conhecido, conversamos com a IA
            const aiResponse = await this.runGroq(env.GROQ_API_KEY, text);
            await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
        }

        // --- FIM DA LÓGICA DA FASE 3 ---
      }
      return new Response('OK');
    } catch (e) {
      console.error(e.stack);
      return new Response('Erro interno do worker', { status: 500 });
    }
  },

  /**
   * NOVO: Lê o conteúdo de um arquivo do GitHub
   */
  async getGithubFileContent(env, filePath) {
    const repo = "VitorSantos1YT/jump-ai-bot-worker"; // Altere se o repositório for outro
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
        return `Não consegui ler o arquivo '${filePath}'. Status: ${response.status}. Verifique se o nome está correto.`;
      }
      const data = await response.json();
      // O conteúdo vem em base64, precisamos decodificar.
      const content = atob(data.content);
      return `Conteúdo do arquivo '${filePath}':\n\n${content.substring(0, 500)}... (mostrando os primeiros 500 caracteres)`;
    } catch (e) {
      console.error("Erro ao ler arquivo do GitHub:", e);
      return "Ocorreu um erro ao tentar usar meus 'braços' para ler o GitHub.";
    }
  },

  async runGroq(apiKey, userInput) {
      // ... (código do runGroq é o mesmo da Fase 2)
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const systemPrompt = "Você é Jump.ai, o cérebro de um sistema de IA que edita sites. O usuário com quem você está falando é um cliente autenticado. Seja prestativo e direto.";
      const response = await fetch(groqUrl, { /* ... corpo da requisição ... */ 
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
  
  // ... (sendMessage, sendChatAction, setupWebhook são os mesmos da Fase 2)
  async sendMessage(token, chatId, text) { /* ... */ 
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }), });
  },
  async sendChatAction(token, chatId, action) { /* ... */ 
    const url = `https://api.telegram.org/bot${token}/sendChatAction`;
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: action }), });
  },
  async setupWebhook(request, env) { /* ... */ 
    const workerUrl = `https://${new URL(request.url).hostname}`;
    const webhookUrl = `${workerUrl}/telegram-webhook`;
    const telegramApiUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`;
    const response = await fetch(telegramApiUrl);
    const result = await response.json();
    return new Response(`Webhook configurado para: ${webhookUrl}\n\nResposta do Telegram: ${JSON.stringify(result)}`);
  }
};

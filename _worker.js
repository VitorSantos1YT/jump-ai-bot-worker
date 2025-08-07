// FASE 3.5 - IMPLEMENTANDO ANÁLISE DE INTENÇÃO

export default {
  async fetch(request, env, ctx) {
    // ... (código existente, sem alterações)
  },

  async handleTelegramWebhook(request, env, ctx) {
    // ... (código existente, sem alterações)
  },
  
  async processMessage(message, env) {
    const chatId = message.chat.id;
    const userId = message.from.id.toString();
    const text = message.text || '(Mensagem não textual)';

    const client = await this.getSupabaseUser(env, userId);
    if (client.error || !client.data) {
        // ... (lógica de acesso negado)
    }
    
    await this.sendChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing');
    
    // --- LÓGICA DE INTENÇÃO (A GRANDE MUDANÇA) ---
    const intent = await this.getIntentWithAI(env, text);

    const GITHUB_REPO = env.GITHUB_REPO_URL;

    // Usamos um 'switch' para decidir o que fazer com base na intenção
    switch (intent.action) {
      case 'read_file':
        const fileContent = await this.getGithubFileContent(env, GITHUB_REPO, intent.file_path);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, fileContent);
        break;
      
      // (Futuramente, teremos 'edit_file', 'approve_change', etc. aqui)

      case 'conversation':
      default:
        const aiResponse = await this.runGroq(env.GROQ_API_KEY, text); // Conversa normal
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse);
        break;
    }
  },

  /**
   * NOVO: Usa a IA para entender a intenção do usuário
   */
  async getIntentWithAI(env, userInput) {
    const systemPrompt = `Analise a mensagem do usuário. Sua tarefa é extrair a intenção e as entidades.
Responda APENAS com um objeto JSON.
As ações (action) possíveis são: "read_file", "edit_file", "approve_change", "conversation".
Se a ação for "read_file" ou "edit_file", extraia o caminho do arquivo (file_path).
Se não tiver certeza, a ação é "conversation".

Exemplos:
- User: "lee arquivo teste.html" -> {"action": "read_file", "file_path": "teste.html"}
- User: "leia o arquivo _worker.js por favor" -> {"action": "read_file", "file_path": "_worker.js"}
- User: "quais ias estao em vc?" -> {"action": "conversation"}
`;
    const responseText = await this.runGroq(env.GROQ_API_KEY, userInput, systemPrompt);
    
    try {
      // Tenta interpretar a resposta da IA como JSON
      return JSON.parse(responseText);
    } catch (e) {
      // Se a IA não responder com JSON, assume que é uma conversa normal
      console.error("Erro ao interpretar a intenção da IA:", responseText);
      return { action: 'conversation' };
    }
  },

  // O resto das funções (getSupabaseUser, getGithubFileContent, runGroq, etc.)
  // permanecem exatamente as mesmas de antes. O comando cat abaixo já contém
  // o código completo e verificado para você.
};

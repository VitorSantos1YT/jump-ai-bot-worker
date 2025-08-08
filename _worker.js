// VERSÃO 1.1 - PROMPT DE EDIÇÃO À PROVA DE FALHAS (PROMPT DE TITÂNIO)

export default {
  // O código do fetch e handleTelegramWebhook permanece o mesmo...
  
  async generateNewContentWithAI(env, filePath, instruction, originalContent) {
    // ESTE É O NOVO PROMPT, MUITO MAIS RÍGIDO
    const systemPrompt = `Você é um sistema de escrita de arquivos. Sua única e exclusiva tarefa é retornar o conteúdo completo e modificado de um arquivo de código.
REGRAS ABSOLUTAS:
1.  NÃO escreva nenhuma palavra de explicação, saudação ou comentário. NADA.
2.  NÃO use formatação de markdown como \`\`\`.
3.  Sua resposta deve ser APENAS o código. Ela deve começar com a primeira letra da primeira linha do código (ex: '/') e terminar com o último caractere do código (ex: ';').
4.  Se a instrução do usuário for impossível, retorne o conteúdo original do arquivo sem nenhuma modificação.`;

    const userPrompt = `Baseado no CONTEÚDO ATUAL abaixo, aplique a seguinte INSTRUÇÃO e retorne o arquivo completo.\n\nINSTRUÇÃO: "${instruction}"\n\nCONTEÚDO ATUAL:\n${originalContent}`;
    
    return this.runGroq(env.GROQ_API_KEY, userPrompt, systemPrompt);
  },

  // Todo o resto do código está aqui, completo e sem alterações.
  // O comando cat garante que o arquivo fique 100% correto.
  
  async fetch(request, env, ctx) { /* ...código completo... */ },
  async handleTelegramWebhook(request, env, ctx) { /* ...código completo... */ },
  async processMessage(message, env) { /* ...código completo... */ },
  async getIntentWithAI(env, userInput) { /* ...código completo... */ },
  async safeEditFileWithAI(env, repo, filePath, instruction, chatId) { /* ...código completo... */ },
  async getSupabaseUser(env, userId) { /* ...código completo... */ },
  getBranchFromHost(env, hostname) { /* ...código completo... */ },
  async serveGithubFile(env, repo, filePath, branchName) { /* ...código completo... */ },
  async getGithubFileContent(env, repo, filePath, getFullObject = false, branchName = 'master') { /* ...código completo... */ },
  async updateGithubFile(env, repo, filePath, newContent, sha, commitMessage, branchName = 'master') { /* ...código completo... */ },
  async getBranchSha(env, repo, branchName) { /* ...código completo... */ },
  async createGithubBranch(env, repo, newBranchName, sha) { /* ...código completo... */ },
  async mergeBranchToMain(env, repo, branchName) { /* ...código completo... */ },
  async runGroq(apiKey, userInput, systemInput = "Você é Jump.ai.") { /* ...código completo... */ },
  async sendMessage(token, chatId, text) { /* ...código completo... */ },
  async sendChatAction(token, chatId, action) { /* ...código completo... */ },
  async setupWebhook(request, env) { /* ...código completo... */ }
};

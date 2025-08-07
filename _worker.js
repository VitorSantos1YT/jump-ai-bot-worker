// FASE 4: IMPLEMENTANDO O FLUXO DE PREVIEW COM BRANCHES

export default {
  // ... (a função fetch e o handleTelegramWebhook permanecem iguais)
  async fetch(request, env, ctx) { /* ... */ },
  async handleTelegramWebhook(request, env, ctx) { /* ... */ },
  
  async processMessage(message, env) {
    // ... (lógica de autenticação do Supabase permanece a mesma)

    // --- NOVA LÓGICA DE COMANDOS ---
    if (text.toLowerCase().startsWith('editar arquivo')) {
        const parts = text.substring(15).trim().split('"');
        const filePath = parts[0].trim();
        const instruction = parts[1];

        if (!filePath || !instruction) { /* ... */ }
        
        // AGORA CHAMAMOS A NOVA FUNÇÃO DE EDIÇÃO SEGURA
        const response = await this.safeEditFileWithAI(env, GITHUB_REPO, filePath, instruction);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, response);

    } else if (text.toLowerCase().startsWith('aprovar')) {
        // NOVO COMANDO PARA APROVAR UMA MUDANÇA
        const branchName = text.substring(8).trim();
        if (!branchName) return this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Por favor, especifique o nome do rascunho para aprovar.");

        const mergeResult = await this.mergeBranchToMain(env, GITHUB_REPO, branchName);
        await this.sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, mergeResult);
    }
    // ... (o resto da lógica permanece a mesma)
  },

  /**
   * NOVO: Orquestra o processo de edição SEGURA com branches e previews
   */
  async safeEditFileWithAI(env, repo, filePath, instruction) {
    const originalFile = await this.getGithubFileContent(env, repo, filePath, true, 'master'); // Lê da branch principal
    if (originalFile.error) {
        return originalFile.message;
    }

    const newContent = await this.generateNewContentWithAI(env, filePath, instruction, originalFile.content);
    if (newContent.startsWith("Desculpe")) {
        return newContent;
    }
    
    // Cria um nome único para o nosso "rascunho" (branch)
    const branchName = `ai-edit-${Date.now()}`;

    // Cria a nova branch a partir da principal
    const createBranchResult = await this.createGithubBranch(env, repo, branchName, originalFile.sha);
    if (!createBranchResult.success) {
        return `❌ Falha ao criar o ambiente de teste: ${createBranchResult.message}`;
    }

    // Salva o novo conteúdo na NOVA branch
    const commitResult = await this.updateGithubFile(env, repo, filePath, newContent, originalFile.sha, `feat: edita ${filePath} via IA`, branchName);

    if (commitResult.success) {
        // Monta a URL de preview mágica da Cloudflare
        const previewUrl = `https://${branchName}.${repo.split('/')[1]}.pages.dev`;
        
        return `✅ Criei um ambiente de teste com sua alteração.\n\n` +
               `👀 **Veja como ficou aqui:** ${previewUrl}\n\n` +
               `👍 Se gostar, responda com:\n` +
               `\`aprovar ${branchName}\``;
    } else {
        return `❌ Falha ao salvar o arquivo no ambiente de teste.\nErro: ${commitResult.message}`;
    }
  },
  
  /**
   * NOVO: Une (merge) o rascunho no site principal
   */
  async mergeBranchToMain(env, repo, branchName) {
    const githubUrl = `https://api.github.com/repos/${repo}/merges`;
    try {
        const response = await fetch(githubUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'JumpAI-Bot' },
            body: JSON.stringify({
                base: 'master', // A branch principal
                head: branchName, // O nosso rascunho
                commit_message: `Merge: aprova alteração de ${branchName}`
            })
        });

        if (response.status === 201) { // 201 Created = Sucesso
            // Opcional: Apagar a branch de rascunho depois do merge
            // await this.deleteGithubBranch(env, repo, branchName);
            return `🚀 Aprovado! A alteração foi publicada no site principal.`;
        } else if (response.status === 204) { // 204 No Content = Já estava igual
            return `✅ A alteração já está no site principal. Nada a fazer.`;
        } else {
            const errorData = await response.json();
            return `❌ Falha ao aprovar. Pode haver um conflito. Erro: ${errorData.message}`;
        }
    } catch (e) {
        return `❌ Erro de rede ao tentar aprovar a alteração.`;
    }
  },

  // (Todas as outras funções como getGithubFileContent, updateGithubFile, runGroq, etc., permanecem as mesmas)
};

// FASE 4 - VERSÃO FINAL E COMPLETA (COM SERVIDOR DE ARQUIVOS)

export default {
  async fetch(request, env, ctx) {
    // try...catch para segurança
    try {
      const url = new URL(request.url);
      
      // Rota do Telegram: o bot conversando
      if (url.pathname === '/telegram-webhook') {
        return this.handleTelegramWebhook(request, env, ctx);
      }
      
      // Rota de Setup: para configurar o bot
      if (url.pathname === '/setup') {
        return this.setupWebhook(request, env);
      }

      // --- NOVA LÓGICA PARA SERVIR O SITE ---
      // Se não for uma rota especial, agimos como um servidor web.
      // A branch é o subdomínio do preview (ex: "ai-edit-123...") ou "master" para o site principal.
      const branchName = this.getBranchFromHost(url.hostname, env) || 'master';
      const path = url.pathname === '/' ? '/teste.html' : url.pathname; // Se for a raiz, mostra teste.html
      
      return this.serveGithubFile(env, env.GITHUB_REPO_URL, path, branchName);

    } catch (e) {
      return new Response(`Erro fatal no Worker:\n${e.message}\n${e.stack}`, { status: 500 });
    }
  },

  // ... (handleTelegramWebhook e processMessage permanecem iguais)
  async handleTelegramWebhook(request, env, ctx) { /* ... */ },
  async processMessage(message, env) { /* ... */ },

  /**
   * NOVO: Pega o nome da branch a partir da URL de preview
   */
  getBranchFromHost(hostname, env) {
      const repoName = env.GITHUB_REPO_URL.split('/')[1];
      const productionHost = `${repoName}.pages.dev`;
      if (hostname.endsWith(productionHost)) {
          const subdomain = hostname.replace(`.${productionHost}`, '');
          // Evita que o domínio principal (ex: "jump-ai-bot-worker") seja tratado como branch
          if (subdomain !== repoName && subdomain !== 'www') { 
              return subdomain;
          }
      }
      return null;
  },

  /**
   * NOVO: Busca um arquivo no GitHub e serve como uma página web
   */
  async serveGithubFile(env, repo, filePath, branchName) {
    // Remove a barra inicial do path, se houver
    const cleanFilePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    
    const fileData = await this.getGithubFileContent(env, repo, cleanFilePath, true, branchName);
    
    if (fileData.error) {
        return new Response(`Arquivo não encontrado no repositório: ${cleanFilePath}`, { status: 404 });
    }
    
    // Define o tipo de conteúdo (MIME type) para o navegador entender
    const contentType = filePath.endsWith('.css') ? 'text/css' : 
                      filePath.endsWith('.js') ? 'application/javascript' : 
                      'text/html;charset=utf-8';
                      
    return new Response(fileData.content, {
        headers: { 'Content-Type': contentType }
    });
  },

  // ... (O resto das funções, safeEditFileWithAI, runGroq, etc., são as mesmas)
  // O comando cat abaixo já contém o código completo e verificado.
};

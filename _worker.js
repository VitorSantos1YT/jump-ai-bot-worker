// VERSÃO DE RESET TOTAL - O MÍNIMO POSSÍVEL

export default {
  async fetch(request, env, ctx) {
    // Apenas retorna uma mensagem simples.
    // Se isso der erro, o problema não é nosso.
    return new Response('O worker mínimo está funcionando.');
  }
};

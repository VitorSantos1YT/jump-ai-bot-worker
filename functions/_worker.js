import { getUser, hasPermission } from '../lib/auth.js';
import { createBranch, createPullRequest, updateFileInBranch } from '../lib/github.js';
import { addJobToQueue } from '../lib/queue.js';
import { log, error } from '../lib/logger.js';
import { sendMessage } from '../lib/telegram.js';

// Função para base64 UTF-8 seguro no Worker
function toBase64UTF8(str) {
  const bytes = new TextEncoder().encode(str);
  const bin = Array.from(bytes, b => String.fromCharCode(b)).join('');
  return btoa(bin);
}

// Simulação simple de detecção de intenção via Gemini (mock)
async function detectIntent(env, text) {
  text = text.toLowerCase();
  if (text.includes('edite') || text.includes('alterar') || text.includes('mude')) return 'edit_code';
  if (text.includes('logo') || text.includes('imagem') || text.includes('desenho')) return 'create_image';
  if (text.trim().length === 0) return 'empty';
  return 'chat';
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === '/webhook') {
        if (request.method !== 'POST') return new Response("OK");
        if (env.TELEGRAM_SECRET) {
          const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
          if (!secretHeader || secretHeader !== env.TELEGRAM_SECRET) {
            console.warn("Webhook secret mismatch.");
            return new Response("Unauthorized", { status: 401 });
          }
        }
        const body = await request.json();
        if (!body || !body.message) return new Response("OK");

        const chatId = body.message.chat.id;
        const user = getUser(body.message.from);

        if (!hasPermission(user.id, env)) {
          error(user, "Acesso não autorizado");
          await sendMessage(env, chatId, "Você não tem permissão para usar este bot.");
          return new Response("OK");
        }

        let text = (body.message.text || "").trim();
        if (body.message.voice) {
          text = "[Áudio transcrito]";
        }
        log(user, "Mensagem recebida", { text });

        const intent = await detectIntent(env, text);
        log(user, "Intenção detectada", { intent });

        if (intent === 'edit_code') {
          const parts = text.split(" ");
          const filePath = parts.length > 1 ? parts[1] : null;
          const instruction = parts.slice(2).join(" ") || "Atualize o arquivo conforme instrução.";
          if (!filePath) {
            await sendMessage(env, chatId, "Por favor, especifique o caminho do arquivo para editar.");
            return new Response("OK");
          }
          if (filePath.includes('..') || filePath.startsWith('/') || filePath.startsWith('\\')) {
            await sendMessage(env, chatId, "Caminho inválido para arquivo. Evite ../ ou / absoluto.");
            return new Response("OK");
          }
          await sendMessage(env, chatId, `Iniciando edição do arquivo ${filePath} conforme sua instrução.`);
          const branchName = `bot/${user.username || user.id}-${Date.now()}`;
          await createBranch(env, branchName);
          log(user, "Branch criado", { branchName });
          const job = { id: `${Date.now()}`, user, chatId, branchName, filePath, instruction };
          await addJobToQueue(env, job);
          const newContent = `// Arquivo gerado pelo Jump.ai Bot\n// Instrução: ${instruction}\n\n// TODO: implementar geração real com LLM.\n`;
          await updateFileInBranch(env, branchName, filePath, `bot: edição automatizada ${filePath}`, newContent);
          log(user, "Arquivo atualizado no branch", { filePath, branchName });
          await createPullRequest(env, branchName, `[Bot] edição: ${filePath}`, `Operação solicitada por @${user.username || user.id}`);
          log(user, "Pull request criado", { branchName });
          await sendMessage(env, chatId, `Edição concluída. Pull request criado na branch ${branchName}.`);
          return new Response("OK");
        }

        if (intent === 'create_image') {
          await sendMessage(env, chatId, "Geração de imagens ainda não implementada. Em breve!");
          return new Response("OK");
        }

        if (intent === 'chat') {
          await sendMessage(env, chatId, "Olá! Estou pronto para ajudá-lo com edições de código ou gerar conteúdo.");
          return new Response("OK");
        }

        if (intent === 'empty') {
          await sendMessage(env, chatId, "Mensagem vazia recebida. Por favor, envie um texto para processar.");
          return new Response("OK");
        }

        await sendMessage(env, chatId, "Desculpe, não entendi sua solicitação.");
        return new Response("OK");
      }

      // Outras rotas: entregar arquivos estáticos/spa, se existir env.ASSETS
      if (env.ASSETS) return env.ASSETS.fetch(request);

      return new Response("Not found", { status: 404 });
    } catch (err) {
      try {
        const user = { id: 'unknown', username: 'unknown' };
        error(user, "Erro no worker", err);
      } catch (e) {
        console.error("Erro ao logar erro:", e);
      }
      return new Response(`Erro interno: ${err.message}`, { status: 500 });
    }
  }
};


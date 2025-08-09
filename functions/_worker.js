import { getUser, hasPermission } from '../lib/auth.js';
import { createBranch, createPullRequest, updateFileInBranch } from '../lib/github.js';
import { addJobToQueue } from '../lib/queue.js';
import { log, error } from '../lib/logger.js';
import { sendMessage } from '../lib/telegram.js';

export default {
  async fetch(request, env) {
    const body = await request.json();
    if (!body.message) return new Response("OK");

    const chatId = body.message.chat.id;
    const user = getUser(body.message.from);
    const text = body.message.text || "";

    try {
      log(user, "Mensagem recebida", { text });

      if (!hasPermission(user.id, env)) {
        error(user, "Tentativa de acesso não autorizada.");
        await sendMessage(env, chatId, "Você não tem permissão para usar este bot.");
        return new Response("OK");
      }

      const [command, ...params] = text.split(" ");
      if (!command.startsWith('/')) {
        await sendMessage(env, chatId, "Olá! Sou o Jump.ai. Use /edite ou /crie.");
        return new Response("OK");
      }

      if (command === "/edite" || command === "/crie") {
        const filePath = params[0];
        const instruction = params.slice(1).join(" ");
        if (!filePath || !instruction) {
          await sendMessage(env, chatId, `Uso: ${command} caminho/arquivo.js instrução`);
          return new Response("OK");
        }

        await sendMessage(env, chatId, `Iniciando operação "${command}"...`);

        const branchName = `bot/${user.username}-${Date.now()}`;
        await createBranch(env, branchName);
        log(user, "Branch criado", { branchName });

        const job = { type: command, user, chatId, branchName, filePath, instruction };
        addJobToQueue(env, job);

        const newContent = `// Arquivo gerado pelo bot\n// Instrução: ${instruction}`;
        await updateFileInBranch(env, branchName, filePath, `bot: ${command} ${filePath}`, newContent);
        log(user, "Arquivo atualizado", { filePath });

        await createPullRequest(env, branchName, `[Bot] ${command}: ${filePath}`, `Solicitado por @${user.username}`);
        log(user, "Pull Request criado");

        await sendMessage(env, chatId, `PR criado com sucesso! Branch: ${branchName}`);
      } else {
        await sendMessage(env, chatId, "Comando não reconhecido. Use /edite ou /crie.");
      }

      return new Response("OK");

    } catch (err) {
      error(user, "Erro no worker", err);
      await sendMessage(env, chatId, `Erro crítico: ${err.message}`);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
};

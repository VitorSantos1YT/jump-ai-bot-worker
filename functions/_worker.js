
// =================================================================================
// FUNÇÕES AUXILIARES DA API DO GITHUB
// =================================================================================

async function getFileContent(repo, path, token) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const response = await fetch(url, { headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" } });
  const data = await response.json();
  if (!response.ok) throw new Error(`Arquivo não encontrado ou erro na API do GitHub: ${data.message}`);
  return { content: atob(data.content), sha: data.sha };
}

async function updateFile(repo, path, message, content, sha, token) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const newContentBase64 = btoa(content);
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Authorization": `token ${token}`, "Content-Type": "application/json", "Accept": "application/vnd.github.v3+json" },
    body: JSON.stringify({ message, content: newContentBase64, sha })
  });
  if (!response.ok) throw new Error(`Erro ao atualizar arquivo: ${await response.text()}`);
  return await response.json();
}

async function createFile(repo, path, message, content, token) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const newContentBase64 = btoa(content);
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Authorization": `token ${token}`, "Content-Type": "application/json", "Accept": "application/vnd.github.v3+json" },
    body: JSON.stringify({ message, content: newContentBase64 })
  });
  if (!response.ok) throw new Error(`Erro ao criar arquivo: ${await response.text()}`);
  return await response.json();
}

// =================================================================================
// FUNÇÕES DE INTELIGÊNCIA ARTIFICIAL
// =================================================================================

async function callLlama(prompt, systemMessage, env) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3-70b-8192",
      messages: [{ role: "system", content: systemMessage }, { role: "user", content: prompt }]
    })
  });
  if (!response.ok) throw new Error(`Erro na API do Llama: ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

// =================================================================================
// ORQUESTRADOR PRINCIPAL (CEO) E TELEGRAM
// =================================================================================

async function handleUpdate(message, env) {
  const chatId = message.chat.id;
  const userText = message.text || "";

  try {
    if (userText.startsWith("/edite ")) {
      await sendMessage(chatId, "Diretiva de EDIÇÃO recebida...", env);
      const [_, filePath, ...instructionParts] = userText.split(" ");
      const instruction = instructionParts.join(" ");
      if (!filePath || !instruction) throw new Error("Uso: /edite <caminho_do_arquivo> <instrução>");
      
      const { content: originalContent, sha } = await getFileContent(env.GITHUB_REPO_URL, filePath, env.GITHUB_TOKEN);
      const systemPromptForEdit = `**PERSONA:** Você é um Engenheiro de Software Sênior. Sua única função é receber um CONTEÚDO ATUAL e uma INSTRUÇÃO, e retornar APENAS o conteúdo completo e modificado do arquivo. Sem explicações.`;
      const newContent = await callLlama( `INSTRUÇÃO: ${instruction}\n\nCONTEÚDO ATUAL:\n${originalContent}`, systemPromptForEdit, env);
      await updateFile(env.GITHUB_REPO_URL, filePath, `Bot edit: ${instruction}`, newContent, sha, env.GITHUB_TOKEN);
      
      await sendMessage(chatId, `SUCESSO: O arquivo "${filePath}" foi modificado no GitHub.`, env);

    } else if (userText.startsWith("/crie ")) {
      await sendMessage(chatId, "Diretiva de CRIAÇÃO recebida...", env);
      const [_, filePath, ...instructionParts] = userText.split(" ");
      const instruction = instructionParts.join(" ");
      if (!filePath || !instruction) throw new Error("Uso: /crie <caminho_do_arquivo> <descrição do conteúdo>");

      const systemPromptForCreate = `**PERSONA:** Você é um Engenheiro de Software Sênior. Sua única função é receber uma INSTRUÇÃO e gerar o conteúdo inicial para um novo arquivo. Retorne APENAS o código/texto. Sem explicações.`;
      const newContent = await callLlama(instruction, systemPromptForCreate, env);
      await createFile(env.GITHUB_REPO_URL, filePath, `Bot create: ${filePath}`, newContent, env.GITHUB_TOKEN);

      await sendMessage(chatId, `SUCESSO: O arquivo "${filePath}" foi criado no GitHub.`, env);

    } else {
      // --- LÓGICA DE CONVERSA NORMAL ---
      const systemPromptForChat = "Você é Jump.ai, um assistente de IA prestativo e direto. Responda de forma concisa.";
      const chatResponse = await callLlama(userText, systemPromptForChat, env);
      await sendMessage(chatId, chatResponse, env);
    }
  } catch (e) {
    console.error(e);
    await sendMessage(chatId, `ERRO NA OPERAÇÃO: ${e.message}`, env);
  }
}

async function sendMessage(chatId, text, env) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}

// Ponto de entrada principal do Worker
export default {
  async fetch(request, env) {
    try {
      if (request.method === "POST") {
        const payload = await request.json();
        if (payload.message) {
          await handleUpdate(payload.message, env);
        }
      }
    } catch (e) {
      console.error("ERRO CRÍTICO NO WORKER:", e);
    }
    return new Response("OK", { status: 200 });
  }
};


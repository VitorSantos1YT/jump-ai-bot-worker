
// GitHub API Helper Functions
async function getFileContent(repo, path, token) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const response = await fetch(url, { headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3.raw" } });
  if (!response.ok) throw new Error(`Erro ao ler arquivo: ${response.statusText}`);
  const content = await response.text();
  
  const shaResponse = await fetch(url, { headers: { "Authorization": `token ${token}`, "Accept": "application/vnd.github.v3+json" } });
  const shaData = await shaResponse.json();
  return { content, sha: shaData.sha };
}

async function updateFile(repo, path, message, content, sha, token) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const newContentBase64 = btoa(content);
  
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: newContentBase64, sha })
  });
  if (!response.ok) throw new Error(`Erro ao atualizar arquivo: ${response.statusText}`);
  return await response.json();
}

// AI Helper Function
async function generateNewContentWithLlama(instruction, originalContent, env) {
  // --- ESTE É O NOVO MANUAL DE INSTRUÇÕES PROFISSIONAL ---
  const systemPrompt = `
  **PERSONA:** Você é um Engenheiro de Software Sênior, especialista em código limpo, eficiente e seguro. Você é meticuloso, preciso e direto.

  **OBJETIVO:** Sua única função é receber o conteúdo de um arquivo de código (CONTEÚDO ATUAL) e uma instrução de modificação (INSTRUÇÃO). Sua única saída deve ser o CONTEÚDO COMPLETO E ATUALIZADO do arquivo.

  **REGRAS ABSOLUTAS:**
  1.  NUNCA escreva explicações, saudações, comentários ou qualquer texto que não seja o código puro do arquivo.
  2.  NÃO use formatação markdown (como \`\`\`javascript).
  3.  Sua resposta DEVE começar com o primeiro caractere da primeira linha de código e terminar com o último caractere da última linha.
  4.  Responda sempre em português do Brasil.
  5.  Se a instrução do usuário for impossível, perigosa, ou levar a um código que não funciona, retorne o CONTEÚDO ATUAL original sem nenhuma modificação.

  **PROCESSO DE PENSAMENTO (Execute internamente):**
  1.  Leia e entenda completamente a INSTRUÇÃO.
  2.  Analise o CONTEÚDO ATUAL para identificar onde a modificação deve ser aplicada.
  3.  Aplique a modificação solicitada.
  4.  Releia o arquivo inteiro que você modificou para garantir que a sintaxe continua válida e que a lógica está correta.
  5.  Retorne o conteúdo completo do arquivo.
  `;
  
  const userPrompt = `Baseado no CONTEÚDO ATUAL abaixo, aplique a seguinte INSTRUÇÃO e retorne o arquivo COMPLETO.\n\nINSTRUÇÃO:\n${instruction}\n\nCONTEÚDO ATUAL:\n${originalContent}`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3-70b-8192",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]
    })
  });
  const data = await response.json();
  return data.choices[0].message.content;
}

// Main Telegram Handler
async function handleUpdate(message, env) {
  const chatId = message.chat.id;
  const userText = message.text || "";

  if (userText.startsWith("/edite ")) {
    try {
      await sendMessage(chatId, "Recebido. Analisando o arquivo e consultando o Engenheiro de Software Sênior (Llama)...", env);
      
      const [_, filePath, ...instructionParts] = userText.split(" ");
      const instruction = instructionParts.join(" ");

      if (!filePath || !instruction) {
        await sendMessage(chatId, "Uso correto: /edite <caminho_do_arquivo> <instrução>", env);
        return;
      }
      
      const { content: originalContent, sha } = await getFileContent(env.GITHUB_REPO_URL, filePath, env.GITHUB_TOKEN);
      const newContent = await generateNewContentWithLlama(instruction, originalContent, env);
      
      await updateFile(env.GITHUB_REPO_URL, filePath, `Bot edit: ${instruction}`, newContent, sha, env.GITHUB_TOKEN);
      
      await sendMessage(chatId, `Operação concluída. O arquivo "${filePath}" foi atualizado no GitHub.`, env);

    } catch (e) {
      console.error(e);
      await sendMessage(chatId, `Ocorreu um erro na operação de edição: ${e.message}`, env);
    }
  } else {
    // Aqui continua a lógica do CEO (Gemini) para conversas normais
    const responseText = `Comando não reconhecido. Para editar um arquivo, use: /edite <arquivo> <instrução>`;
    await sendMessage(chatId, responseText, env);
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

// Main Worker Entrypoint
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
      console.error("ERRO CRÍTICO:", e);
    }
    return new Response("OK", { status: 200 });
  }
};


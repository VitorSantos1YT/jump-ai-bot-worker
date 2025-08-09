const GITHUB_API_BASE = "https://api.github.com";

async function githubApiRequest(env, endpoint, method = 'GET', body = null) {
  const url = `${GITHUB_API_BASE}/repos/${env.GITHUB_REPO_URL}${endpoint}`;
  const headers = {
    "Authorization": `token ${env.GITHUB_TOKEN}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "JumpAI-Bot-Worker"
  };

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro na API do GitHub (${response.status}): ${errorText}`);
  }
  if (response.status === 204 || response.status === 201) return null;
  return response.json();
}

export async function createBranch(env, newBranchName) {
  const mainBranch = await githubApiRequest(env, `/branches/${env.GITHUB_MAIN_BRANCH || 'main'}`);
  const mainBranchSha = mainBranch.commit.sha;
  await githubApiRequest(env, '/git/refs', 'POST', {
    ref: `refs/heads/${newBranchName}`,
    sha: mainBranchSha
  });
}

export async function updateFileInBranch(env, branch, path, message, content) {
    const contentBase64 = btoa(unescape(encodeURIComponent(content)));
    let sha = null;
    try {
        const fileData = await githubApiRequest(env, `/contents/${path}?ref=${branch}`);
        sha = fileData.sha;
    } catch (e) {
        // Ignora, significa que o arquivo é novo
    }
    const body = { message, content: contentBase64, branch };
    if (sha) {
        body.sha = sha;
    }
    await githubApiRequest(env, `/contents/${path}`, 'PUT', body);
}

export async function createPullRequest(env, headBranch, title, body) {
  await githubApiRequest(env, '/pulls', 'POST', {
    title,
    head: headBranch,
    base: env.GITHUB_MAIN_BRANCH || 'main',
    body
  });
}

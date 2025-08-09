const GITHUB_API_BASE = "https://api.github.com";

async function githubApiRequest(env, endpoint, method = 'GET', body = null) {
  const url = `${GITHUB_API_BASE}/repos/${env.GITHUB_REPO_URL}${endpoint}`;
  const headers = {
    "Authorization": `token ${env.GITHUB_TOKEN}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "JumpAI-Bot-Worker"
  };
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Erro GitHub (${response.status}): ${errorText}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function createBranch(env, newBranchName) {
  const mainBranch = await githubApiRequest(env, `/branches/${env.GITHUB_MAIN_BRANCH || 'main'}`);
  const sha = mainBranch.commit.sha;
  await githubApiRequest(env, '/git/refs', 'POST', { ref: `refs/heads/${newBranchName}`, sha });
}

export async function updateFileInBranch(env, branch, path, message, content) {
  const contentBase64 = btoa(unescape(encodeURIComponent(content)));
  let sha = null;
  try {
    const fileData = await githubApiRequest(env, `/contents/${path}?ref=${branch}`);
    sha = fileData.sha;
  } catch {}
  const body = { message, content: contentBase64, branch };
  if (sha) body.sha = sha;
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

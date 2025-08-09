export async function addJobToQueue(env, job) {
  console.log(">> Job adicionado à fila (simulado):", JSON.stringify(job, null, 2));
  await new Promise(r => setTimeout(r, 200));
  return true;
}

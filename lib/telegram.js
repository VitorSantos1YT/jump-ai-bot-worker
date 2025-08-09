export async function sendMessage(env, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("Telegram sendMessage failed:", res.status, t);
  }
}

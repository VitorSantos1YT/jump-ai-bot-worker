export function getUser(from) {
  return {
    id: from.id,
    username: from.username || 'N/A',
    fullName: `${from.first_name || ''} ${from.last_name || ''}`.trim()
  };
}

export function hasPermission(userId, env) {
  const allowed = (env.ALLOWED_TELEGRAM_IDS || "").toString().trim();
  if (!allowed) return false;
  return allowed.split(',').map(s => s.trim()).includes(userId.toString());
}

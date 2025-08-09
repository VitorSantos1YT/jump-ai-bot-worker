export function getUser(from) {
  return {
    id: from.id,
    username: from.username || 'N/A',
    fullName: `${from.first_name} ${from.last_name || ''}`.trim()
  };
}

export function hasPermission(userId, env) {
  const allowedUsers = env.ALLOWED_TELEGRAM_IDS || "";
  return allowedUsers.split(',').includes(userId.toString());
}

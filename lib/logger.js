export function log(user, message, metadata = {}) {
  console.log(JSON.stringify({
    level: 'INFO',
    timestamp: new Date().toISOString(),
    user: user.username || 'N/A',
    userId: user.id,
    message,
    ...metadata
  }));
}

export function error(user, message, errorObj = {}) {
  console.error(JSON.stringify({
    level: 'ERROR',
    timestamp: new Date().toISOString(),
    user: user.username || 'N/A',
    userId: user.id,
    message,
    errorMessage: errorObj.message || null,
    stack: errorObj.stack || null
  }));
}

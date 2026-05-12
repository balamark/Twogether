function logDbError(label, error, extra = {}) {
  console.error(label, {
    message: error.message,
    code: error.code,
    detail: error.detail,
    constraint: error.constraint,
    ...extra,
  });
}

function errorResponseBody(message, error) {
  const body = { success: false, message };
  if (process.env.NODE_ENV !== 'production' && error) {
    body.error = error.message;
  }
  return body;
}

module.exports = { logDbError, errorResponseBody };

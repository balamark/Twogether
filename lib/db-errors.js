const { logError } = require('./logger');

function logDbError(label, error, extra = {}) {
  logError(label, {
    errorMessage: error.message,
    code: error.code,
    detail: error.detail,
    constraint: error.constraint,
    status: error.status,
    responseData: error.responseData,
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

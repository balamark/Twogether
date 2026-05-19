const { logError } = require('./logger');

function logDbError(label, error, extra = {}) {
  // Emit as a single structured Cloud Logging entry. Keys land as
  // jsonPayload.<key> in Logs Explorer, e.g. jsonPayload.status=400.
  logError(label, {
    errorMessage: error.message,
    code: error.code,
    detail: error.detail,
    constraint: error.constraint,
    // Upstream HTTP errors (e.g. Supabase Storage axios responses) — the
    // actual cause shows up here rather than being hidden behind the
    // Postgres-shaped fields above.
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

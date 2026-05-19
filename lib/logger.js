// Structured logger for Cloud Logging on App Engine.
//
// Emits a single line of JSON with a `severity` field. The App Engine log
// shipper natively parses this format ("structured logging on stdout"), so
// every call becomes one queryable Cloud Logging entry where each field
// lands under jsonPayload.<field>. Raw `console.log(label, obj)` instead
// splits multi-line object output into N separate entries, which is what
// made earlier errors hard to read.
//
// Severity values match GCP's LogSeverity enum:
// https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity

const PROD = process.env.NODE_ENV === 'production';
const QUIET = process.env.NODE_ENV === 'test' && process.env.LOG_VERBOSE !== '1';

function safeReplacer(_key, value) {
  // Don't dump Buffer contents — they make logs huge and aren't queryable.
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}B]`;
  // Strip Authorization-ish secrets if a caller accidentally includes them.
  if (typeof value === 'string' && /^Bearer\s+/i.test(value)) return '[REDACTED]';
  return value;
}

function emit(severity, message, fields = {}) {
  // In test mode we silence everything below ERROR to keep test output clean,
  // mirroring middleware/logging.js's QUIET behavior. Errors always print so
  // failing tests surface their cause.
  if (QUIET && severity !== 'ERROR' && severity !== 'CRITICAL') return;

  const entry = {
    severity,
    message,
    time: new Date().toISOString(),
    ...fields,
  };

  const line = PROD
    ? JSON.stringify(entry, safeReplacer)
    : `[${severity}] ${message} ${
        Object.keys(fields).length ? JSON.stringify(fields, safeReplacer) : ''
      }`.trimEnd();

  // WARNING+ → stderr, everything else → stdout. Matches GCP convention.
  const stream =
    severity === 'ERROR' || severity === 'CRITICAL' || severity === 'WARNING'
      ? process.stderr
      : process.stdout;
  stream.write(line + '\n');
}

const logInfo = (message, fields) => emit('INFO', message, fields);
const logWarn = (message, fields) => emit('WARNING', message, fields);
const logError = (message, fields) => emit('ERROR', message, fields);

module.exports = { emit, logInfo, logWarn, logError };

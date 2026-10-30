// One UUID per user intent (e.g. minted when a deposit form opens), sent as the
// idempotency key so a double-submit or a retried timeout is applied once
// server-side. Falls back to a random string where crypto.randomUUID is
// unavailable (older/insecure contexts).
export const newIdemKey = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

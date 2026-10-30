// Whole-number text inputs: type="number" keeps whatever the user typed
// (e.g. "0700") because React sees the same numeric value and never rewrites
// the field. Driving a text input from this parser instead strips non-digits
// and leading zeros on every keystroke, and lets the field be cleared (0 → '').
export const parseDigits = (raw: string, max = Number.MAX_SAFE_INTEGER): number => {
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return 0;
  return Math.min(Number(digits), max);
};

export const digitsValue = (n: number): string => (n > 0 ? String(n) : '');

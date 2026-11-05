export type ParameterInput = { valid: true; value: number | null } | { valid: false; message: string };

/** Text stays local until Apply. Blank is unset; incomplete numeric expressions are not committed. */
export function parseParameterInput(text: string): ParameterInput {
  const trimmed = text.trim();
  if (!trimmed) return { valid: true, value: null };
  if (!/^[+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return { valid: false, message: 'Enter a positive number, or leave blank to unset.' };
  }
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? { valid: true, value }
    : { valid: false, message: 'Value must be finite and greater than zero.' };
}

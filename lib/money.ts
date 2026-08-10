/**
 * Peso entry.
 *
 * Money is not a count, so it is keyed rather than stepped — but it is still
 * structured: the app owns the peso sign, only digits and one decimal point are
 * accepted, and the amount is checked against real limits before it can be sent
 * as centavos.
 */

/** Digits, at most one decimal point, at most two decimal places. */
export function sanitizeMoneyInput(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (!rest.length) return whole.slice(0, 9);
  return `${whole.slice(0, 9)}.${rest.join("").slice(0, 2)}`;
}

export const MONEY_BOUNDS = { minMinor: 100, maxMinor: 100_000_000 } as const;

export type MoneyParse =
  | { ok: true; minor: number | null }
  | { ok: false; error: string };

/**
 * Pesos as typed → centavos. An empty field parses as "nothing entered", which
 * is why `minor` can be null on success — the screen decides whether that is
 * allowed, since a price is required to accept a job but a filter is not.
 */
export function parseMoney(value: string): MoneyParse {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, minor: null };

  const pesos = Number(trimmed);
  if (!Number.isFinite(pesos)) {
    return { ok: false, error: "Enter an amount in pesos, for example 1200.00." };
  }
  const minor = Math.round(pesos * 100);
  if (minor < MONEY_BOUNDS.minMinor) {
    return { ok: false, error: "Your price must be at least ₱1.00." };
  }
  if (minor > MONEY_BOUNDS.maxMinor) {
    return {
      ok: false,
      error: "That is above ₱1,000,000. Ask Operations to price this job manually.",
    };
  }
  return { ok: true, minor };
}

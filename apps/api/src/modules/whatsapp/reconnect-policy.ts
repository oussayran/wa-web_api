const RECONNECT_DELAYS_MS = [2_000, 5_000, 10_000, 30_000];

export const MAX_RECONNECT_ATTEMPTS = 10;

export function getReconnectDelay(attempt: number): number {
  if (attempt <= 0) return RECONNECT_DELAYS_MS[0]!;
  return RECONNECT_DELAYS_MS[attempt - 1] ?? 60_000;
}

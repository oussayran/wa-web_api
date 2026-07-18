import { AppError } from '../errors/app-error.js';

interface WindowState {
  count: number;
  resetsAt: number;
}

export class RateLimitService {
  private readonly windows = new Map<string, WindowState>();

  assertAllowed(key: string, limit: number): void {
    const current = this.windows.get(key);
    if (!current || current.resetsAt <= Date.now() || current.count < limit) return;
    const retryAfter = Math.max(1, Math.ceil((current.resetsAt - Date.now()) / 1000));
    throw new AppError('RATE_LIMIT_EXCEEDED', 'Too many requests. Try again later.', 429, retryAfter);
  }

  consume(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    const current = this.windows.get(key);
    if (!current || current.resetsAt <= now) {
      this.windows.set(key, { count: 1, resetsAt: now + windowMs });
      return;
    }
    if (current.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((current.resetsAt - now) / 1000));
      throw new AppError('RATE_LIMIT_EXCEEDED', 'Too many requests. Try again later.', 429, retryAfter);
    }
    current.count += 1;
  }

  clear(key: string): void {
    this.windows.delete(key);
  }
}

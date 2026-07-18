import { describe, expect, it } from 'vitest';
import { isConnectionTransitionAllowed } from '../src/modules/whatsapp/connection-state.js';
import { getReconnectDelay } from '../src/modules/whatsapp/reconnect-policy.js';

describe('connection state and reconnect policy', () => {
  it('allows lifecycle transitions used by QR linking and reconnects', () => {
    expect(isConnectionTransitionAllowed('DISCONNECTED', 'INITIALIZING')).toBe(true);
    expect(isConnectionTransitionAllowed('INITIALIZING', 'WAITING_FOR_QR')).toBe(true);
    expect(isConnectionTransitionAllowed('WAITING_FOR_QR', 'CONNECTED')).toBe(true);
    expect(isConnectionTransitionAllowed('CONNECTED', 'RECONNECTING')).toBe(true);
    expect(isConnectionTransitionAllowed('RECONNECTING', 'CONNECTED')).toBe(true);
  });

  it('rejects an unsupported direct transition', () => {
    expect(isConnectionTransitionAllowed('DISCONNECTED', 'CONNECTED')).toBe(false);
  });

  it('calculates the documented bounded reconnect delays', () => {
    expect([1, 2, 3, 4, 5, 10].map(getReconnectDelay)).toEqual([2_000, 5_000, 10_000, 30_000, 60_000, 60_000]);
  });
});

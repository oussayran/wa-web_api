import type { ConnectionStatus } from './whatsapp.types.js';

const allowedTransitions: Record<ConnectionStatus, ReadonlySet<ConnectionStatus>> = {
  DISCONNECTED: new Set(['DISCONNECTED', 'INITIALIZING', 'LOGGED_OUT', 'ERROR']),
  INITIALIZING: new Set(['INITIALIZING', 'CONNECTING', 'WAITING_FOR_QR', 'DISCONNECTED', 'LOGGED_OUT', 'ERROR']),
  WAITING_FOR_QR: new Set(['WAITING_FOR_QR', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'LOGGED_OUT', 'ERROR']),
  CONNECTING: new Set(['CONNECTING', 'WAITING_FOR_QR', 'CONNECTED', 'RECONNECTING', 'DISCONNECTED', 'LOGGED_OUT', 'ERROR']),
  CONNECTED: new Set(['CONNECTED', 'RECONNECTING', 'DISCONNECTED', 'LOGGED_OUT', 'ERROR']),
  RECONNECTING: new Set(['RECONNECTING', 'INITIALIZING', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'LOGGED_OUT', 'ERROR']),
  LOGGED_OUT: new Set(['LOGGED_OUT', 'INITIALIZING', 'DISCONNECTED', 'ERROR']),
  ERROR: new Set(['ERROR', 'INITIALIZING', 'RECONNECTING', 'DISCONNECTED', 'LOGGED_OUT']),
};

export function isConnectionTransitionAllowed(from: ConnectionStatus, to: ConnectionStatus): boolean {
  return allowedTransitions[from].has(to);
}

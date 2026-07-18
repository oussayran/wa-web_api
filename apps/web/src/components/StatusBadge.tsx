import { statusLabel } from '../lib/format';

const styles: Record<string, string> = {
  CONNECTED: 'border-emerald-300/70 bg-emerald-50 text-emerald-800',
  DELIVERED: 'border-emerald-300/70 bg-emerald-50 text-emerald-800',
  READ: 'border-emerald-300/70 bg-emerald-50 text-emerald-800',
  SENT: 'border-sky-300/70 bg-sky-50 text-sky-800',
  ACCEPTED: 'border-sky-300/70 bg-sky-50 text-sky-800',
  QUEUED: 'border-amber-300/70 bg-amber-50 text-amber-900',
  WAITING_FOR_QR: 'border-amber-300/70 bg-amber-50 text-amber-900',
  CONNECTING: 'border-amber-300/70 bg-amber-50 text-amber-900',
  INITIALIZING: 'border-amber-300/70 bg-amber-50 text-amber-900',
  RECONNECTING: 'border-amber-300/70 bg-amber-50 text-amber-900',
  ERROR: 'border-red-300/70 bg-red-50 text-red-800',
  FAILED: 'border-red-300/70 bg-red-50 text-red-800',
  LOGGED_OUT: 'border-red-300/70 bg-red-50 text-red-800',
  DISCONNECTED: 'border-stone-300 bg-stone-100 text-stone-700',
};

export function StatusBadge({ status }: { status: string }) {
  const isActive = ['CONNECTED', 'DELIVERED', 'READ'].includes(status);
  return (
    <span className={`status-badge ${styles[status] ?? styles.DISCONNECTED}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-current' : 'border border-current'}`} />
      {statusLabel(status)}
    </span>
  );
}

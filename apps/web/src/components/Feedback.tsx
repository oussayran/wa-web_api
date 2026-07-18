import type { ReactNode } from 'react';
import { Icon } from './Icon';

export const PLATFORM_WARNING = "This connection uses WhatsApp’s linked-device mechanism and is not the official Meta WhatsApp Business Platform. Sessions may disconnect, WhatsApp changes may affect functionality, and improper automated messaging may cause account restrictions.";

export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <div className="error-alert" role="alert">
      <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function PlatformWarning({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`platform-warning ${compact ? 'text-xs' : ''}`} aria-label="Platform warning">
      <Icon name="warning" size={19} className="mt-0.5 shrink-0" />
      <p>{PLATFORM_WARNING}</p>
    </aside>
  );
}

export function LoadingBlock({ label = 'Loading operations data' }: { label?: string }) {
  return (
    <div className="panel flex min-h-52 items-center justify-center" role="status">
      <span className="spinner" />
      <span className="ml-3 text-sm text-forest-700">{label}</span>
    </div>
  );
}

export function EmptyState({ icon = 'activity', title, children }: { icon?: 'activity' | 'history' | 'message'; title: string; children: ReactNode }) {
  return (
    <div className="panel flex min-h-56 flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-full border border-cream-300 bg-cream-100 text-forest-700">
        <Icon name={icon} size={22} />
      </span>
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-2 max-w-md text-sm leading-6 text-stone-600">{children}</div>
    </div>
  );
}

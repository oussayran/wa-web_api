export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatPhone(value: string | null | undefined): string {
  if (!value) return 'Not connected';
  return value.startsWith('+') ? value : `+${value}`;
}

export function statusLabel(status: string): string {
  return status.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

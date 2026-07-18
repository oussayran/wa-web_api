import type { SVGProps } from 'react';

export type IconName =
  | 'activity'
  | 'arrow-left'
  | 'arrow-right'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'history'
  | 'link'
  | 'lock'
  | 'logout'
  | 'message'
  | 'phone'
  | 'power'
  | 'refresh'
  | 'send'
  | 'shield'
  | 'terminal'
  | 'unlink'
  | 'user'
  | 'warning'
  | 'wifi';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  const paths: Record<IconName, React.ReactNode> = {
    activity: <><path d="M3 12h4l2.5-7 5 14 2.5-7h4" /></>,
    'arrow-left': <><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></>,
    'arrow-right': <><path d="m9 18 6-6-6-6" /><path d="M4 12h11" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8M8 13h5" /></>,
    phone: <><path d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M10 17h4" /></>,
    power: <><path d="M12 2v10" /><path d="M18.4 5.6a9 9 0 1 1-12.8 0" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.7-2L20 8M4 16l2.2 2a7 7 0 0 0 11.7-2" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-5" /></>,
    terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></>,
    unlink: <><path d="m3 3 18 18" /><path d="M10.6 10.6a5 5 0 0 0-3.7.3l-2 2A5 5 0 0 0 12 20l1.1-1.1" /><path d="M13.4 13.4a5 5 0 0 0 3.7-.3l2-2A5 5 0 0 0 12 4l-1.1 1.1" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    warning: <><path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
    wifi: <><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="20" r=".5" fill="currentColor" /></>,
  };

  return <svg {...common} {...props}>{paths[name]}</svg>;
}

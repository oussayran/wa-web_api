import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../lib/api';
import { Icon, type IconName } from './Icon';

const navigation: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Overview', icon: 'activity', end: true },
  { to: '/send', label: 'Send message', icon: 'send' },
  { to: '/history', label: 'History', icon: 'history' },
];

export function AppLayout() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      setLogoutError(errorMessage(error));
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="relative overflow-hidden bg-forest-950 text-cream-100 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="console-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-4 lg:block lg:border-0 lg:px-7 lg:pb-8 lg:pt-7">
          <NavLink to="/" className="inline-flex items-center gap-3 focus-ring-dark" aria-label="Relay Console overview">
            <span className="grid h-9 w-9 place-items-center rounded-sm border border-signal/40 bg-signal/10 text-signal">
              <Icon name="terminal" size={19} />
            </span>
            <span>
              <span className="block font-display text-lg font-semibold tracking-wide">Relay</span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.27em] text-cream-300">Operations console</span>
            </span>
          </NavLink>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-cream-300 lg:mt-8">
            <span className="h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_12px_#b8e36d]" />
            System ready
          </span>
        </div>

        <nav className="relative flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2 lg:block lg:border-0 lg:px-4" aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="relative mt-auto hidden px-5 pb-6 lg:block">
          <div className="border-t border-white/10 pt-5">
            <div className="flex items-center gap-3 px-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-cream-200"><Icon name="user" size={15} /></span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-cream-100">{admin?.email}</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-cream-300">Administrator</p>
              </div>
            </div>
            {logoutError ? <p className="mt-3 text-xs text-red-200" role="alert">{logoutError}</p> : null}
            <button type="button" onClick={handleLogout} disabled={loggingOut} className="mt-4 inline-flex w-full items-center gap-2 rounded-sm px-2 py-2 text-xs text-cream-300 transition hover:bg-white/5 hover:text-white focus-ring-dark disabled:opacity-50">
              <Icon name="logout" size={16} />
              {loggingOut ? 'Signing out…' : 'Sign out securely'}
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="flex h-14 items-center justify-between border-b border-cream-300 bg-cream-50/90 px-4 backdrop-blur sm:px-7 lg:justify-end">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-forest-700 lg:hidden">
            <Icon name="shield" size={15} /> Authenticated
          </div>
          <button type="button" onClick={handleLogout} disabled={loggingOut} className="btn-ghost text-xs lg:hidden">
            <Icon name="logout" size={15} /> Sign out
          </button>
          <div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-stone-500 lg:flex">
            <Icon name="lock" size={14} /> Cookie-authenticated session
          </div>
        </header>
        {logoutError ? <div className="bg-red-50 px-5 py-2 text-center text-xs text-red-800 lg:hidden" role="alert">{logoutError}</div> : null}
        <main className="mx-auto w-full max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { errorMessage } from '../lib/api';

export function LoginPage() {
  const { admin, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-forest-950 text-cream-100" role="status">
        <div className="flex items-center gap-3 font-mono text-xs uppercase tracking-widest"><span className="spinner" /> Verifying session</div>
      </div>
    );
  }

  if (admin) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (loginError) {
      setError(errorMessage(loginError));
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-cream-100 lg:grid lg:grid-cols-[minmax(420px,0.92fr)_minmax(520px,1.08fr)]">
      <section className="relative hidden min-h-screen overflow-hidden bg-forest-950 p-12 text-cream-100 lg:flex lg:flex-col lg:justify-between" aria-label="Relay Console introduction">
        <div className="console-grid absolute inset-0 opacity-60" />
        <div className="login-radar absolute -right-48 top-1/2 aspect-square w-[680px] -translate-y-1/2 rounded-full border border-signal/15" />
        <div className="relative z-10 inline-flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-sm border border-signal/40 bg-signal/10 text-signal"><Icon name="terminal" /></span>
          <div>
            <p className="font-display text-xl font-semibold">Relay</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.28em] text-cream-300">Operations console</p>
          </div>
        </div>
        <div className="relative z-10 max-w-lg">
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-signal">Private control surface / 01</p>
          <h1 className="mt-5 font-display text-5xl font-semibold leading-[1.04] tracking-tight xl:text-6xl">Messaging operations, under control.</h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-cream-300">Connect a managed WhatsApp session, verify recipients, and monitor every outbound message from one deliberate workflow.</p>
        </div>
        <div className="relative z-10 flex gap-8 border-t border-white/10 pt-5 font-mono text-[9px] uppercase tracking-[0.18em] text-cream-300">
          <span className="inline-flex items-center gap-2"><Icon name="lock" size={13} /> Cookie session</span>
          <span className="inline-flex items-center gap-2"><Icon name="shield" size={13} /> CSRF protected</span>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-sm bg-forest-900 text-signal"><Icon name="terminal" /></span>
            <div><p className="font-display text-xl font-semibold">Relay</p><p className="font-mono text-[9px] uppercase tracking-[0.23em] text-forest-600">Operations console</p></div>
          </div>
          <p className="eyebrow">Restricted access</p>
          <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">Open your console</h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">Use the administrator credentials configured for this service.</p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5" noValidate>
            {error ? <ErrorAlert>{error}</ErrorAlert> : null}
            <div>
              <label className="field-label" htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="input" aria-invalid={Boolean(error)} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-semibold text-ink" htmlFor="password">Password</label>
                <span className="font-mono text-[9px] uppercase tracking-widest text-stone-500">Encrypted in transit</span>
              </div>
              <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="input" aria-invalid={Boolean(error)} />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={submitting || !email.trim() || !password}>
              {submitting ? <span className="spinner" /> : <Icon name="lock" size={17} />}
              {submitting ? 'Authenticating…' : 'Enter secure console'}
            </button>
          </form>

          <p className="mt-8 border-t border-cream-300 pt-5 text-xs leading-5 text-stone-500">Sessions are stored in secure cookies. This console never stores authentication credentials in browser storage.</p>
        </div>
      </section>
    </main>
  );
}

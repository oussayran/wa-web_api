import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';

export function NotFoundPage() {
  return (
    <div className="panel flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-forest-600">404 / route unavailable</p>
      <h1 className="mt-4 font-display text-4xl font-semibold text-ink">This station does not exist.</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-stone-600">Return to the connection desk to continue managing active operations.</p>
      <Link to="/" className="btn-primary mt-7"><Icon name="arrow-left" size={16} /> Return to overview</Link>
    </div>
  );
}

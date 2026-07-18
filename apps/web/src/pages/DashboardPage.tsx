import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorAlert, LoadingBlock, PlatformWarning } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api, errorMessage } from '../lib/api';
import { formatDate, formatPhone } from '../lib/format';
import { createAuthenticatedSocket } from '../lib/socket';
import type {
  WhatsAppConnectedEvent,
  WhatsAppDisconnectedEvent,
  WhatsAppErrorEvent,
  WhatsAppInstance,
  WhatsAppStatusEvent,
} from '../types';

function updateInstance(items: WhatsAppInstance[], instanceId: string, values: Partial<WhatsAppInstance>) {
  return items.map((instance) => instance.id === instanceId ? { ...instance, ...values } : instance);
}

export function DashboardPage() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [instanceId, setInstanceId] = useState('default');
  const [instanceName, setInstanceName] = useState('Main operations');
  const [createError, setCreateError] = useState('');
  const instanceIds = instances.map((instance) => instance.id).join(',');

  async function loadInstances(showLoader = false) {
    if (showLoader) setLoading(true);
    try {
      const result = await api.instances();
      setInstances(result);
      setError('');
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInstances();
  }, []);

  useEffect(() => {
    if (!instanceIds) return;
    const socket = createAuthenticatedSocket();
    const ids = instanceIds.split(',');
    const subscribe = () => ids.forEach((id) => socket.emit('whatsapp.subscribe', { instanceId: id }));
    socket.on('connect', subscribe);
    socket.on('whatsapp.status', (event: WhatsAppStatusEvent) => {
      setInstances((current) => updateInstance(current, event.instanceId, { status: event.status }));
    });
    socket.on('whatsapp.connected', (event: WhatsAppConnectedEvent) => {
      setInstances((current) => updateInstance(current, event.instanceId, {
        status: 'CONNECTED',
        connectedPhone: event.connectedPhone ?? current.find((item) => item.id === event.instanceId)?.connectedPhone ?? null,
        lastConnectedAt: event.timestamp,
        lastErrorMessage: null,
      }));
    });
    socket.on('whatsapp.disconnected', (event: WhatsAppDisconnectedEvent) => {
      setInstances((current) => updateInstance(current, event.instanceId, { status: event.status, lastDisconnectedAt: event.timestamp }));
    });
    socket.on('whatsapp.error', (event: WhatsAppErrorEvent) => {
      setInstances((current) => updateInstance(current, event.instanceId, { status: 'ERROR', lastErrorMessage: event.message }));
    });
    if (socket.connected) subscribe();
    return () => {
      socket.disconnect();
    };
  }, [instanceIds]);

  async function createInstance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError('');
    const id = instanceId.trim();
    const name = instanceName.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,49}$/.test(id)) {
      setCreateError('Use 1–50 lowercase letters, numbers, hyphens, or underscores.');
      return;
    }
    if (!name) {
      setCreateError('Enter a name for this connection.');
      return;
    }
    setAction('create');
    try {
      const created = await api.createInstance(id, name);
      setInstances([created]);
    } catch (creationError) {
      setCreateError(errorMessage(creationError));
    } finally {
      setAction('');
    }
  }

  async function runAction(instance: WhatsAppInstance, type: 'disconnect' | 'logout') {
    setAction(`${type}:${instance.id}`);
    setError('');
    try {
      if (type === 'disconnect') await api.disconnect(instance.id);
      else await api.logoutInstance(instance.id);
      await loadInstances();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setAction('');
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Control room / overview"
        title="Connection desk"
        description="Monitor linked sessions and take deliberate connection actions from a single operational view."
        action={instances.some((instance) => instance.status === 'CONNECTED') ? (
          <Link to="/send" className="btn-primary"><Icon name="send" size={17} /> Compose message</Link>
        ) : undefined}
      />

      {error ? <div className="mb-5"><ErrorAlert>{error}</ErrorAlert></div> : null}
      {loading ? <LoadingBlock label="Reading connection state" /> : null}

      {!loading && instances.length === 0 ? (
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
          <EmptyState title="No connection configured">
            Create the first managed instance. Its identifier becomes part of the API path and cannot be changed later.
          </EmptyState>
          <form onSubmit={createInstance} className="panel p-5 sm:p-7" noValidate>
            <p className="eyebrow">First-time setup</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Create default instance</h2>
            <div className="mt-6 space-y-5">
              {createError ? <ErrorAlert>{createError}</ErrorAlert> : null}
              <div>
                <label htmlFor="instance-id" className="field-label">Instance ID</label>
                <input id="instance-id" value={instanceId} onChange={(event) => setInstanceId(event.target.value)} className="input font-mono" maxLength={50} required aria-describedby="instance-id-hint" />
                <p id="instance-id-hint" className="field-hint">Lowercase letters, numbers, hyphens, and underscores only.</p>
              </div>
              <div>
                <label htmlFor="instance-name" className="field-label">Display name</label>
                <input id="instance-name" value={instanceName} onChange={(event) => setInstanceName(event.target.value)} className="input" maxLength={100} required />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={action === 'create'}>
                {action === 'create' ? <span className="spinner" /> : <Icon name="link" size={17} />}
                {action === 'create' ? 'Creating instance…' : 'Create instance'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {!loading && instances.length > 0 ? (
        <section className="grid gap-5 xl:grid-cols-2" aria-label="WhatsApp instances">
          {instances.map((instance, index) => {
            const isBusy = action.endsWith(`:${instance.id}`);
            const canDisconnect = !['DISCONNECTED', 'LOGGED_OUT'].includes(instance.status);
            return (
              <article key={instance.id} className="panel overflow-hidden">
                <div className="flex items-start justify-between gap-4 border-b border-cream-300 px-5 py-5 sm:px-6">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-sm bg-forest-900 font-mono text-sm font-bold text-signal">{String(index + 1).padStart(2, '0')}</span>
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-xl font-semibold text-ink">{instance.name}</h2>
                      <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-wider text-stone-500">Station {instance.id}</p>
                    </div>
                  </div>
                  <StatusBadge status={instance.status} />
                </div>

                <div className="grid gap-px bg-cream-300 sm:grid-cols-3">
                  <div className="bg-cream-50 px-5 py-4">
                    <p className="data-label">Connected phone</p>
                    <p className="mt-2 truncate font-mono text-xs font-semibold text-ink">{formatPhone(instance.connectedPhone)}</p>
                  </div>
                  <div className="bg-cream-50 px-5 py-4">
                    <p className="data-label">Last connected</p>
                    <p className="mt-2 text-xs leading-5 text-stone-700">{formatDate(instance.lastConnectedAt)}</p>
                  </div>
                  <div className="bg-cream-50 px-5 py-4">
                    <p className="data-label">Last disconnected</p>
                    <p className="mt-2 text-xs leading-5 text-stone-700">{formatDate(instance.lastDisconnectedAt)}</p>
                  </div>
                </div>

                {instance.lastErrorMessage ? (
                  <div className="flex gap-2 border-t border-red-200 bg-red-50 px-5 py-3 text-xs leading-5 text-red-800" role="status">
                    <Icon name="warning" size={15} className="mt-0.5 shrink-0" />
                    <span><strong>Last error:</strong> {instance.lastErrorMessage}</span>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2 px-5 py-4 sm:px-6">
                  <Link to={`/connect/${encodeURIComponent(instance.id)}`} className={instance.status === 'CONNECTED' ? 'btn-secondary' : 'btn-primary'}>
                    <Icon name={instance.status === 'CONNECTED' ? 'wifi' : 'link'} size={16} />
                    {instance.status === 'CONNECTED' ? 'View connection' : 'Connect'}
                  </Link>
                  <button type="button" className="btn-secondary" disabled={!canDisconnect || isBusy} onClick={() => void runAction(instance, 'disconnect')}>
                    {action === `disconnect:${instance.id}` ? <span className="spinner" /> : <Icon name="power" size={16} />}
                    Disconnect
                  </button>
                  <button type="button" className="btn-danger sm:ml-auto" disabled={isBusy} onClick={() => void runAction(instance, 'logout')}>
                    {action === `logout:${instance.id}` ? <span className="spinner" /> : <Icon name="unlink" size={16} />}
                    Log out session
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      <div className="mt-6"><PlatformWarning compact /></div>
    </div>
  );
}

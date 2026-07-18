import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorAlert, LoadingBlock } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api, errorMessage } from '../lib/api';
import { formatDate, formatPhone } from '../lib/format';
import { createAuthenticatedSocket } from '../lib/socket';
import type { MessagePage, MessageStatus, MessageStatusEvent, WhatsAppInstance, WhatsAppStatusEvent } from '../types';

const statuses: MessageStatus[] = ['QUEUED', 'ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED'];

export function HistoryPage() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [messages, setMessages] = useState<MessagePage | null>(null);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const instanceIds = instances.map((instance) => instance.id).join(',');

  useEffect(() => {
    let active = true;
    void api.instances()
      .then((items) => {
        if (!active) return;
        setInstances(items);
        if (items[0]) setInstanceId(items[0].id);
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoadingInstances(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!instanceId) return;
    let active = true;
    setLoadingMessages(true);
    void api.messages(instanceId, page, status)
      .then((result) => {
        if (!active) return;
        setMessages(result);
        setError('');
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });
    return () => {
      active = false;
    };
  }, [instanceId, page, status, refreshVersion]);

  useEffect(() => {
    if (!instanceIds) return;
    const socket = createAuthenticatedSocket();
    const ids = instanceIds.split(',');
    const subscribe = () => ids.forEach((id) => socket.emit('whatsapp.subscribe', { instanceId: id }));
    socket.on('connect', subscribe);
    socket.on('message.status', (event: MessageStatusEvent) => {
      if (event.instanceId === instanceId) setRefreshVersion((current) => current + 1);
    });
    socket.on('whatsapp.status', (event: WhatsAppStatusEvent) => {
      setInstances((current) => current.map((instance) => instance.id === event.instanceId ? { ...instance, status: event.status } : instance));
    });
    if (socket.connected) subscribe();
    return () => {
      socket.disconnect();
    };
  }, [instanceId, instanceIds]);

  function selectInstance(value: string) {
    setInstanceId(value);
    setPage(1);
    setMessages(null);
  }

  function selectStatus(value: string) {
    setStatus(value);
    setPage(1);
  }

  if (loadingInstances) return <LoadingBlock label="Loading message archive" />;

  if (!instances.length) {
    return (
      <div>
        <PageHeader eyebrow="Delivery ledger" title="Message history" description="Review outbound status transitions without exposing internal record identifiers." />
        <EmptyState icon="history" title="No history available">
          <p>Create an instance and send a message to begin the delivery ledger.</p>
          <Link to="/" className="btn-primary mt-5"><Icon name="arrow-left" size={16} /> Go to connection desk</Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Delivery ledger / outbound"
        title="Message history"
        description="Track accepted, sent, delivered, read, and failed outbound messages. Message content is limited to its stored preview."
        action={<Link to="/send" className="btn-primary"><Icon name="send" size={16} /> New message</Link>}
      />

      {error ? <div className="mb-5"><ErrorAlert>{error}</ErrorAlert></div> : null}

      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-cream-300 bg-cream-50 p-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="history-instance" className="field-label">Instance</label>
              <select id="history-instance" value={instanceId} onChange={(event) => selectInstance(event.target.value)} className="select">
                {instances.map((instance) => <option key={instance.id} value={instance.id}>{instance.name} · {instance.status === 'CONNECTED' ? formatPhone(instance.connectedPhone) : 'Not connected'}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="history-status" className="field-label">Status</label>
              <select id="history-status" value={status} onChange={(event) => selectStatus(event.target.value)} className="select">
                <option value="">All statuses</option>
                {statuses.map((item) => <option key={item} value={item}>{item.charAt(0) + item.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
          </div>
          <div className="flex min-h-10 items-center font-mono text-[10px] uppercase tracking-wider text-stone-500" role="status">
            {loadingMessages ? <><span className="spinner mr-2" /> Refreshing ledger</> : `${messages?.pagination.total ?? 0} records`}
          </div>
        </div>

        {loadingMessages && !messages ? (
          <div className="flex min-h-64 items-center justify-center text-sm text-stone-500"><span className="spinner mr-3" /> Reading message records</div>
        ) : messages?.items.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <caption className="sr-only">Outbound message history</caption>
                <thead>
                  <tr className="border-b border-cream-300 bg-cream-100/70 font-mono text-[9px] uppercase tracking-[0.15em] text-stone-500">
                    <th scope="col" className="px-5 py-3 font-semibold">Date</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Recipient</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Preview</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Error</th>
                  </tr>
                </thead>
                <tbody className={loadingMessages ? 'opacity-60' : ''}>
                  {messages.items.map((message) => (
                    <tr key={message.id} className="border-b border-cream-200 last:border-0 hover:bg-cream-100/60">
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-stone-600">{formatDate(message.createdAt)}</td>
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-xs font-semibold text-ink">+{message.recipient.replace(/^\+/, '')}</td>
                      <td className="max-w-sm px-5 py-4 text-sm text-stone-700"><span className="line-clamp-2">{message.preview || 'Preview not stored'}</span></td>
                      <td className="px-5 py-4"><StatusBadge status={message.status} /></td>
                      <td className="max-w-xs px-5 py-4 text-xs leading-5 text-red-700">{message.error?.message ?? <span className="text-stone-400">None</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={`divide-y divide-cream-300 md:hidden ${loadingMessages ? 'opacity-60' : ''}`}>
              {messages.items.map((message) => (
                <article key={message.id} className="p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-semibold text-ink">+{message.recipient.replace(/^\+/, '')}</p><p className="mt-1 text-[11px] text-stone-500">{formatDate(message.createdAt)}</p></div><StatusBadge status={message.status} /></div>
                  <div className="mt-3 rounded-sm bg-cream-100 p-3 text-sm leading-5 text-stone-700">{message.preview || 'Preview not stored'}</div>
                  <div className="mt-3"><p className="data-label">Error</p><p className={`mt-1 text-xs leading-5 ${message.error ? 'text-red-700' : 'text-stone-400'}`}>{message.error?.message ?? 'None'}</p></div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-cream-100 text-forest-700"><Icon name="history" size={20} /></span>
            <h2 className="mt-4 font-display text-xl font-semibold text-ink">No matching messages</h2>
            <p className="mt-2 text-sm text-stone-500">Change the status filter or send a message from this instance.</p>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-cream-300 bg-cream-100/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-stone-500">Page {messages?.pagination.page ?? page} of {messages?.pagination.pages ?? 1}</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary min-h-9 px-3 py-1.5 text-xs" disabled={page <= 1 || loadingMessages} onClick={() => setPage((current) => Math.max(1, current - 1))}><Icon name="arrow-left" size={14} /> Previous</button>
            <button type="button" className="btn-secondary min-h-9 px-3 py-1.5 text-xs" disabled={page >= (messages?.pagination.pages ?? 1) || loadingMessages} onClick={() => setPage((current) => current + 1)}>Next <Icon name="arrow-right" size={14} /></button>
          </div>
        </div>
      </section>
    </div>
  );
}

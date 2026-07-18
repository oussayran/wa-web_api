import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorAlert, LoadingBlock } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api, errorMessage } from '../lib/api';
import { formatDate, formatPhone } from '../lib/format';
import { createAuthenticatedSocket } from '../lib/socket';
import type { NumberCheckResult, SendResult, WhatsAppInstance, WhatsAppStatusEvent } from '../types';

interface Verification {
  key: string;
  result: NumberCheckResult;
}

export function SendPage() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [instanceId, setInstanceId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verification, setVerification] = useState<Verification | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [checkError, setCheckError] = useState('');
  const [result, setResult] = useState<SendResult | null>(null);
  const instanceIds = instances.map((instance) => instance.id).join(',');
  const selectedInstance = instances.find((instance) => instance.id === instanceId);
  const verificationKey = `${instanceId}:${phoneNumber.trim()}`;
  const isVerified = verification?.key === verificationKey && verification.result.exists;

  useEffect(() => {
    let active = true;
    void api.instances()
      .then((items) => {
        if (!active) return;
        setInstances(items);
        const preferred = items.find((item) => item.status === 'CONNECTED') ?? items[0];
        if (preferred) setInstanceId(preferred.id);
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!instanceIds) return;
    const socket = createAuthenticatedSocket();
    const ids = instanceIds.split(',');
    const subscribe = () => ids.forEach((id) => socket.emit('whatsapp.subscribe', { instanceId: id }));
    socket.on('connect', subscribe);
    socket.on('whatsapp.status', (event: WhatsAppStatusEvent) => {
      setInstances((current) => current.map((instance) => instance.id === event.instanceId ? { ...instance, status: event.status } : instance));
    });
    socket.on('whatsapp.connected', (event: { instanceId: string; connectedPhone?: string }) => {
      setInstances((current) => current.map((instance) => instance.id === event.instanceId ? { ...instance, status: 'CONNECTED', connectedPhone: event.connectedPhone ?? instance.connectedPhone } : instance));
    });
    socket.on('whatsapp.disconnected', (event: WhatsAppStatusEvent) => {
      setInstances((current) => current.map((instance) => instance.id === event.instanceId ? { ...instance, status: event.status } : instance));
    });
    if (socket.connected) subscribe();
    return () => {
      socket.disconnect();
    };
  }, [instanceIds]);

  function changeInstance(value: string) {
    setInstanceId(value);
    setVerification(null);
    setCheckError('');
    setResult(null);
  }

  function changeNumber(value: string) {
    setPhoneNumber(value);
    setVerification(null);
    setCheckError('');
    setResult(null);
  }

  async function checkNumber() {
    if (!selectedInstance || selectedInstance.status !== 'CONNECTED' || !phoneNumber.trim()) return;
    setChecking(true);
    setCheckError('');
    setResult(null);
    const keyAtRequest = verificationKey;
    try {
      const checked = await api.checkNumber(instanceId, phoneNumber.trim());
      setVerification({ key: keyAtRequest, result: checked });
      if (!checked.exists) setCheckError(checked.reason ?? 'This number is not available on WhatsApp.');
    } catch (numberError) {
      setVerification(null);
      setCheckError(errorMessage(numberError));
    } finally {
      setChecking(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isVerified || !consent || !message.trim() || message.length > 4000 || selectedInstance?.status !== 'CONNECTED') return;
    setSending(true);
    setError('');
    setResult(null);
    try {
      const sent = await api.sendText(instanceId, phoneNumber.trim(), message, crypto.randomUUID());
      setResult(sent);
      setMessage('');
      setConsent(false);
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      setSending(false);
    }
  }

  const sendDisabled = sending
    || selectedInstance?.status !== 'CONNECTED'
    || !isVerified
    || !message.trim()
    || message.length > 4000
    || !consent;

  if (loading) return <LoadingBlock label="Preparing message controls" />;

  if (!instances.length) {
    return (
      <div>
        <PageHeader eyebrow="Outbound desk" title="Send a message" description="Verify the recipient before composing an outbound message." />
        <EmptyState icon="message" title="A connection is required">
          <p>Create and connect an instance before sending a message.</p>
          <Link to="/" className="btn-primary mt-5"><Icon name="arrow-left" size={16} /> Go to connection desk</Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Outbound desk / verified send"
        title="Send a message"
        description="Choose a connected station, verify the destination, then confirm recipient consent before sending."
        action={<Link to="/history" className="btn-secondary"><Icon name="history" size={16} /> View history</Link>}
      />

      <form onSubmit={sendMessage} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" noValidate>
        <div className="panel overflow-hidden">
          <section className="border-b border-cream-300 p-5 sm:p-7" aria-labelledby="recipient-heading">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-forest-900 font-mono text-xs font-bold text-signal">01</span>
              <div><p className="eyebrow">Routing</p><h2 id="recipient-heading" className="font-display text-xl font-semibold text-ink">Verify the recipient</h2></div>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="send-instance" className="field-label">Sending instance</label>
                <select id="send-instance" value={instanceId} onChange={(event) => changeInstance(event.target.value)} className="select">
                  {instances.map((instance) => <option key={instance.id} value={instance.id}>{instance.name} · {instance.status === 'CONNECTED' ? formatPhone(instance.connectedPhone) : 'Not connected'}</option>)}
                </select>
                <div className="mt-2"><StatusBadge status={selectedInstance?.status ?? 'DISCONNECTED'} /></div>
              </div>
              <div>
                <label htmlFor="recipient-number" className="field-label">Recipient number</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input id="recipient-number" type="tel" autoComplete="tel" value={phoneNumber} onChange={(event) => changeNumber(event.target.value)} className="input min-w-0 flex-1 font-mono" aria-describedby="phone-hint phone-result" aria-invalid={Boolean(checkError)} required />
                  <button type="button" onClick={() => void checkNumber()} className="btn-secondary shrink-0" disabled={checking || selectedInstance?.status !== 'CONNECTED' || !phoneNumber.trim()}>
                    {checking ? <span className="spinner" /> : <Icon name="phone" size={16} />}
                    {checking ? 'Checking…' : 'Check number'}
                  </button>
                </div>
                <p id="phone-hint" className="field-hint">Use international format beginning with + and the country code.</p>
                <div id="phone-result" className="mt-2 min-h-5" aria-live="polite">
                  {isVerified ? <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><Icon name="check" size={15} /> Verified on WhatsApp as +{verification.result.normalizedNumber}</p> : null}
                  {checkError ? <p className="text-xs font-semibold text-red-700" role="alert">{checkError}</p> : null}
                </div>
              </div>
            </div>
            {selectedInstance?.status !== 'CONNECTED' ? (
              <div className="mt-5"><ErrorAlert>This instance is not connected. <Link to={`/connect/${encodeURIComponent(instanceId)}`} className="font-semibold underline">Open its connection page</Link> before checking a number.</ErrorAlert></div>
            ) : null}
          </section>

          <section className="p-5 sm:p-7" aria-labelledby="message-heading">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-forest-900 font-mono text-xs font-bold text-signal">02</span>
              <div><p className="eyebrow">Content</p><h2 id="message-heading" className="font-display text-xl font-semibold text-ink">Compose message</h2></div>
            </div>
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-4">
                <label htmlFor="message" className="text-sm font-semibold text-ink">Message</label>
                <span className={`font-mono text-[10px] tabular-nums ${message.length >= 3900 ? 'text-red-700' : 'text-stone-500'}`} aria-live="polite">{message.length} / 4000</span>
              </div>
              <textarea id="message" value={message} onChange={(event) => { setMessage(event.target.value); setResult(null); }} className="input min-h-52 resize-y leading-6" maxLength={4000} required disabled={!isVerified} aria-describedby="message-hint" />
              <p id="message-hint" className="field-hint">Recipient verification is invalidated whenever the number or sending instance changes.</p>
            </div>
            <label className={`mt-5 flex items-start gap-3 rounded-sm border p-4 transition ${consent ? 'border-forest-600 bg-emerald-50/60' : 'border-cream-300 bg-cream-100'} ${!isVerified ? 'opacity-55' : ''}`}>
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={!isVerified} required className="mt-0.5 h-4 w-4 rounded border-stone-400 text-forest-800 focus:ring-forest-700" />
              <span className="text-sm font-medium leading-5 text-ink">I confirm that the recipient has consented to receive this message.</span>
            </label>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="panel-dark p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-signal">Final control</p>
            <h2 className="mt-2 font-display text-2xl font-semibold">Ready to transmit?</h2>
            <div className="mt-6 space-y-3 border-y border-white/10 py-5 text-xs text-cream-300">
              <div className="flex items-center justify-between gap-3"><span>Station online</span><Icon name={selectedInstance?.status === 'CONNECTED' ? 'check' : 'warning'} size={15} className={selectedInstance?.status === 'CONNECTED' ? 'text-signal' : 'text-amber-300'} /></div>
              <div className="flex items-center justify-between gap-3"><span>Number verified</span><Icon name={isVerified ? 'check' : 'warning'} size={15} className={isVerified ? 'text-signal' : 'text-amber-300'} /></div>
              <div className="flex items-center justify-between gap-3"><span>Consent confirmed</span><Icon name={consent ? 'check' : 'warning'} size={15} className={consent ? 'text-signal' : 'text-amber-300'} /></div>
            </div>
            <button type="submit" className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-sm bg-signal px-4 py-2 text-sm font-bold text-forest-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-forest-900 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-cream-300/60" disabled={sendDisabled}>
              {sending ? <span className="spinner" /> : <Icon name="send" size={17} />}
              {sending ? 'Transmitting…' : 'Send message'}
            </button>
            <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-wider text-cream-300/70">One request · One idempotency key</p>
          </section>

          {error ? <ErrorAlert>{error}</ErrorAlert> : null}
          {result ? (
            <section className="panel border-emerald-300 bg-emerald-50 p-5" aria-live="polite">
              <div className="flex items-center justify-between gap-3"><p className="eyebrow">API result</p><StatusBadge status={result.status} /></div>
              <h2 className="mt-3 font-display text-xl font-semibold text-ink">Send request recorded</h2>
              <dl className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between gap-4"><dt className="text-stone-500">Recipient</dt><dd className="font-mono font-semibold">+{result.recipient.replace(/^\+/, '')}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-stone-500">Recorded</dt><dd className="text-right">{formatDate(result.createdAt)}</dd></div>
              </dl>
              {result.status === 'ACCEPTED' ? <p className="mt-4 border-t border-emerald-200 pt-4 text-xs leading-5 text-emerald-900"><strong>ACCEPTED</strong> means WhatsApp accepted the send request. It does not mean the message was delivered or read.</p> : <p className="mt-4 border-t border-emerald-200 pt-4 text-xs leading-5 text-emerald-900">The displayed badge is the actual status returned by the API.</p>}
            </section>
          ) : null}
        </aside>
      </form>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { ErrorAlert, PlatformWarning } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { StatusBadge } from '../components/StatusBadge';
import { api, errorMessage } from '../lib/api';
import { formatPhone } from '../lib/format';
import { createAuthenticatedSocket } from '../lib/socket';
import type {
  ConnectionStatus,
  WhatsAppConnectedEvent,
  WhatsAppDisconnectedEvent,
  WhatsAppErrorEvent,
  WhatsAppInstance,
  WhatsAppQrEvent,
  WhatsAppStatusEvent,
} from '../types';

interface QrState {
  image: string;
  expiresAt: string;
}

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

export function ConnectPage() {
  const { instanceId = '' } = useParams();
  const [instance, setInstance] = useState<WhatsAppInstance | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('INITIALIZING');
  const [qr, setQr] = useState<QrState | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [requesting, setRequesting] = useState(true);
  const [error, setError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const maySubscribeRef = useRef(false);

  function subscribe() {
    if (maySubscribeRef.current && socketRef.current?.connected) {
      socketRef.current.emit('whatsapp.subscribe', { instanceId });
    }
  }

  async function requestConnection() {
    setRequesting(true);
    setError('');
    try {
      const response = await api.connect(instanceId);
      maySubscribeRef.current = true;
      setStatus(response.status as ConnectionStatus);
      subscribe();
    } catch (connectionError) {
      setError(errorMessage(connectionError));
    } finally {
      setRequesting(false);
    }
  }

  useEffect(() => {
    const socket = createAuthenticatedSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      if (maySubscribeRef.current) socket.emit('whatsapp.subscribe', { instanceId });
    });
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('connect_error', () => setSocketConnected(false));
    socket.on('whatsapp.status', (event: WhatsAppStatusEvent) => {
      if (event.instanceId === instanceId) setStatus(event.status);
    });
    socket.on('whatsapp.qr', (event: WhatsAppQrEvent) => {
      if (event.instanceId !== instanceId) return;
      setQr({ image: event.qrImageDataUrl, expiresAt: event.expiresAt });
      setStatus('WAITING_FOR_QR');
      setError('');
    });
    socket.on('whatsapp.connected', (event: WhatsAppConnectedEvent) => {
      if (event.instanceId !== instanceId) return;
      setStatus('CONNECTED');
      setQr(null);
      setInstance((current) => current ? {
        ...current,
        status: 'CONNECTED',
        connectedPhone: event.connectedPhone ?? current.connectedPhone,
        lastConnectedAt: event.timestamp,
      } : current);
    });
    socket.on('whatsapp.disconnected', (event: WhatsAppDisconnectedEvent) => {
      if (event.instanceId === instanceId) setStatus(event.status);
    });
    socket.on('whatsapp.error', (event: WhatsAppErrorEvent) => {
      if (event.instanceId !== instanceId) return;
      setStatus('ERROR');
      setError(event.message);
    });

    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
  }, [instanceId]);

  useEffect(() => {
    let active = true;
    void api.instance(instanceId)
      .then((result) => {
        if (!active) return;
        setInstance(result);
        setStatus(result.status);
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError));
      });

    // Deferring avoids issuing a duplicate POST during React's development-only effect probe.
    const timer = window.setTimeout(() => {
      if (active) void requestConnection();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [instanceId]);

  useEffect(() => {
    if (!qr) {
      setSecondsLeft(0);
      return;
    }
    let reconnectRequested = false;
    let active = true;

    const update = () => {
      const remaining = Math.max(0, Math.ceil((new Date(qr.expiresAt).getTime() - Date.now()) / 1000));
      if (!active) return;
      setSecondsLeft(remaining);
      if (remaining === 0 && !reconnectRequested) {
        reconnectRequested = true;
        setQr(null);
        setError('The QR code expired. Requesting a fresh code…');
        void api.connect(instanceId)
          .then((response) => {
            if (!active) return;
            maySubscribeRef.current = true;
            setStatus(response.status as ConnectionStatus);
            setError('');
            subscribe();
          })
          .catch((reconnectError: unknown) => {
            if (active) setError(errorMessage(reconnectError));
          });
      }
    };

    update();
    const interval = window.setInterval(update, 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [instanceId, qr?.expiresAt]);

  return (
    <div>
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-forest-700 hover:text-forest-900 focus:outline-none focus-visible:underline">
        <Icon name="arrow-left" size={16} /> Back to connection desk
      </Link>

      <header className="mb-7 flex flex-col gap-4 border-b border-cream-300 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Linked device / secure pairing</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Connect WhatsApp</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">Pair {instance?.name ?? 'this instance'} by scanning the live linked-device code.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-stone-500">
            <span className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-600' : 'bg-red-500'}`} />
            Live channel {socketConnected ? 'online' : 'reconnecting'}
          </span>
          <StatusBadge status={status} />
        </div>
      </header>

      {error ? <div className="mb-5"><ErrorAlert>{error}</ErrorAlert></div> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)]">
        <section className="panel-dark relative flex min-h-[430px] items-center justify-center overflow-hidden p-6 sm:min-h-[520px] sm:p-10" aria-live="polite">
          <div className="console-grid absolute inset-0 opacity-60" />
          <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
            {status === 'CONNECTED' ? (
              <>
                <span className="grid h-20 w-20 place-items-center rounded-full border border-signal/30 bg-signal/10 text-signal"><Icon name="check" size={38} /></span>
                <h2 className="mt-6 font-display text-3xl font-semibold">Connection established</h2>
                <p className="mt-3 text-sm leading-6 text-cream-300">{formatPhone(instance?.connectedPhone)} is ready for controlled outbound messaging.</p>
                <Link to="/send" className="mt-7 inline-flex min-h-10 items-center gap-2 rounded-sm bg-signal px-5 py-2 text-sm font-bold text-forest-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-forest-900">
                  Compose message <Icon name="arrow-right" size={16} />
                </Link>
              </>
            ) : qr ? (
              <>
                <div className="rounded-sm bg-white p-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
                  <img src={qr.image} alt="WhatsApp linked-device QR code" draggable={false} className="aspect-square w-full max-w-[290px] select-none" />
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <span className="font-mono text-xs uppercase tracking-wider text-cream-300">Code expires in</span>
                  <span className="rounded-sm border border-signal/30 bg-signal/10 px-2.5 py-1 font-mono text-sm font-bold text-signal">{formatCountdown(secondsLeft)}</span>
                </div>
              </>
            ) : (
              <>
                <span className="grid h-20 w-20 place-items-center rounded-full border border-white/15 bg-white/5 text-signal">
                  {requesting ? <span className="h-7 w-7 animate-spin rounded-full border-2 border-current border-r-transparent" /> : <Icon name="wifi" size={34} />}
                </span>
                <h2 className="mt-6 font-display text-2xl font-semibold">{requesting ? 'Requesting secure code' : 'Waiting for live code'}</h2>
                <p className="mt-3 max-w-xs text-sm leading-6 text-cream-300">The QR image is delivered only through the authenticated live channel.</p>
                {!requesting ? (
                  <button type="button" onClick={() => void requestConnection()} className="mt-6 inline-flex items-center gap-2 rounded-sm border border-white/20 px-4 py-2 text-sm font-semibold text-cream-100 hover:border-signal hover:text-signal focus:outline-none focus:ring-2 focus:ring-signal">
                    <Icon name="refresh" size={16} /> Request a new code
                  </button>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section className="panel flex flex-col p-5 sm:p-8">
          <p className="eyebrow">On your phone</p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink">Link in four steps</h2>
          <ol className="mt-7 space-y-6">
            <li className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-forest-700 font-mono text-xs font-bold text-forest-800">01</span><div><p className="font-semibold text-ink">Open WhatsApp</p><p className="mt-1 text-sm leading-6 text-stone-600">Use the phone that owns the number you want this station to send from.</p></div></li>
            <li className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-forest-700 font-mono text-xs font-bold text-forest-800">02</span><div><p className="font-semibold text-ink">Open Linked Devices</p><p className="mt-1 text-sm leading-6 text-stone-600">Open Linked Devices from WhatsApp settings or the application menu.</p></div></li>
            <li className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-forest-700 font-mono text-xs font-bold text-forest-800">03</span><div><p className="font-semibold text-ink">Select Link a Device</p><p className="mt-1 text-sm leading-6 text-stone-600">Authorize the phone prompt to open the linked-device scanner.</p></div></li>
            <li className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-forest-700 font-mono text-xs font-bold text-forest-800">04</span><div><p className="font-semibold text-ink">Scan the QR code</p><p className="mt-1 text-sm leading-6 text-stone-600">Keep this page open until the station reports a connected state.</p></div></li>
          </ol>
          <div className="mt-auto pt-8"><PlatformWarning compact /></div>
        </section>
      </div>
    </div>
  );
}

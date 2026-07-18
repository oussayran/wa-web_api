import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorAlert, LoadingBlock } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { api, errorMessage } from '../lib/api';
import { formatDate, formatPhone } from '../lib/format';
import { createAuthenticatedSocket } from '../lib/socket';
import { ApiError } from '../lib/api';
import type { MessageDirection, MessageNewEvent, MessageRecord, MessageStatusEvent, WhatsAppInstance, WhatsAppStatusEvent } from '../types';

function contactFromMessage(msg: MessageRecord): string {
  return msg.direction === 'INBOUND' ? msg.sender ?? '' : msg.recipient;
}

function normalizeNumber(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  const withPrefix = digits.startsWith('+') ? digits : `+${digits}`;
  return withPrefix.slice(1).replace(/[\s().-]/g, '');
}

function isPhoneNumber(value: string): boolean {
  return /^\d{7,15}$/.test(value);
}

function displayContact(contact: string): string {
  if (isPhoneNumber(contact)) return `+${contact}`;
  return contact;
}

export function HistoryPage() {
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [page, setPage] = useState(1);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [showList, setShowList] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [newChatNumber, setNewChatNumber] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const instanceIds = instances.map((instance) => instance.id).join(',');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const newChatInputRef = useRef<HTMLInputElement>(null);

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
    void api.messages(instanceId, page, '')
      .then((result) => {
        if (!active) return;
        setMessages(result.items);
        setTotalPages(result.pagination.pages);
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
  }, [instanceId, page, refreshVersion]);

  useEffect(() => {
    if (!instanceIds) return;
    const socket = createAuthenticatedSocket();
    const ids = instanceIds.split(',');
    const subscribe = () => ids.forEach((id) => socket.emit('whatsapp.subscribe', { instanceId: id }));
    socket.on('connect', subscribe);
    socket.on('message.status', (event: MessageStatusEvent) => {
      if (event.instanceId === instanceId) setRefreshVersion((current) => current + 1);
    });
    socket.on('message.new', (event: MessageNewEvent) => {
      console.log('📩 message.new received:', JSON.stringify(event, null, 2));
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

  useEffect(() => {
    if (showNewChat) newChatInputRef.current?.focus();
  }, [showNewChat]);

  const conversations = useMemo(() => {
    const groups = new Map<string, MessageRecord[]>();
    for (const msg of messages) {
      const contact = contactFromMessage(msg);
      if (!contact) continue;
      const existing = groups.get(contact);
      if (existing) {
        existing.push(msg);
      } else {
        groups.set(contact, [msg]);
      }
    }
    return [...groups.entries()]
      .map(([contact, msgs]) => {
        const sorted = msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return {
          contact,
          messages: sorted,
          lastMessage: sorted[sorted.length - 1]!,
        };
      })
      .sort((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());
  }, [messages]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.contact === selectedContact) ?? null,
    [conversations, selectedContact],
  );

  useEffect(() => {
    if (conversations.length && !selectedContact) {
      setSelectedContact(conversations[0]!.contact);
    }
  }, [conversations, selectedContact]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function selectInstance(value: string) {
    setInstanceId(value);
    setPage(1);
    setMessages([]);
    setSelectedContact(null);
    setSendError('');
    setNewChatNumber('');
    setShowNewChat(false);
  }

  function startNewChat() {
    const number = normalizeNumber(newChatNumber);
    if (!number || number.length < 8) return;
    const exists = conversations.find((c) => c.contact === number);
    if (exists) {
      setSelectedContact(number);
    } else {
      setSelectedContact(number);
    }
    setNewChatNumber('');
    setShowNewChat(false);
    setShowList(false);
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const contact = selectedContact;
    if (!contact || !inputText.trim() || sending) return;
    if (!isPhoneNumber(contact)) {
      setSendError('Cannot reply to this contact — no phone number available.');
      return;
    }
    const instance = instances.find((i) => i.id === instanceId);
    if (!instance || instance.status !== 'CONNECTED') {
      setSendError('Instance is not connected.');
      return;
    }
    const phoneNumber = `+${contact}`;
    setSending(true);
    setSendError('');
    try {
      const checked = await api.checkNumber(instanceId, phoneNumber);
      if (!checked.exists) {
        setSendError('This number is not available on WhatsApp.');
        setSending(false);
        return;
      }
      await api.sendText(instanceId, phoneNumber, inputText.trim(), crypto.randomUUID());
      setInputText('');
      setRefreshVersion((current) => current + 1);
    } catch (sendErr: unknown) {
      if (sendErr instanceof ApiError) {
        setSendError(`[${sendErr.code}] ${sendErr.message} (status=${sendErr.status}${sendErr.requestId ? `, requestId=${sendErr.requestId}` : ''})`);
      } else {
        setSendError(errorMessage(sendErr));
      }
    } finally {
      setSending(false);
    }
  }

  if (loadingInstances) return <LoadingBlock label="Loading conversations" />;

  if (!instances.length) {
    return (
      <div>
        <PageHeader eyebrow="Chat" title="Messages" description="WhatsApp conversations." />
        <EmptyState icon="message" title="No conversations">
          <p>Create an instance and connect to WhatsApp to start chatting.</p>
          <Link to="/" className="btn-primary mt-5"><Icon name="arrow-left" size={16} /> Go to connection desk</Link>
        </EmptyState>
      </div>
    );
  }

  const connected = instances.find((i) => i.id === instanceId)?.status === 'CONNECTED';

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <PageHeader
        eyebrow="Chat"
        title="Messages"
        description="WhatsApp conversations."
        action={
          <div className="flex items-center gap-3">
            <select
              id="chat-instance"
              value={instanceId}
              onChange={(event) => selectInstance(event.target.value)}
              className="select min-h-9 py-1.5 text-xs"
            >
              {instances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.name} · {instance.status === 'CONNECTED' ? formatPhone(instance.connectedPhone) : 'Not connected'}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {error ? <div className="mb-3"><ErrorAlert>{error}</ErrorAlert></div> : null}

      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-lg border border-cream-300 bg-white shadow-xs">
        {showList && (
          <aside className="flex w-full flex-col border-r border-cream-300 md:w-80 md:min-w-72">
            <div className="flex items-center justify-between border-b border-cream-200 bg-cream-50 px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-stone-500">
                {loadingMessages ? 'Loading...' : `${conversations.length} conversation${conversations.length !== 1 ? 's' : ''}`}
              </p>
              {showNewChat ? (
                <button type="button" className="text-[10px] text-stone-500 hover:text-stone-800" onClick={() => { setShowNewChat(false); setNewChatNumber(''); }}>
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary min-h-7 px-2.5 py-1 text-[10px]"
                  onClick={() => setShowNewChat(true)}
                  disabled={!connected}
                >
                  <Icon name="user" size={12} /> New chat
                </button>
              )}
            </div>

            {showNewChat && (
              <div className="border-b border-cream-200 bg-white px-4 py-3">
                <form
                  onSubmit={(e) => { e.preventDefault(); startNewChat(); }}
                  className="flex flex-col gap-2"
                >
                  <input
                    ref={newChatInputRef}
                    type="tel"
                    value={newChatNumber}
                    onChange={(e) => setNewChatNumber(e.target.value)}
                    placeholder="+33612345678"
                    className="input font-mono text-sm"
                    autoComplete="tel"
                  />
                  <p className="font-mono text-[9px] text-stone-400">Use an international number beginning with + and a country code.</p>
                  <button type="submit" className="btn-primary self-end text-xs" disabled={normalizeNumber(newChatNumber).length < 8}>
                    Start chat
                  </button>
                </form>
              </div>
            )}

            <nav className="flex-1 overflow-y-auto">
              {loadingMessages && !messages.length ? (
                <div className="flex min-h-32 items-center justify-center text-sm text-stone-500"><span className="spinner mr-2" /> Loading</div>
              ) : conversations.length ? (
                conversations.map((conv) => (
                  <button
                    key={conv.contact}
                    type="button"
                    onClick={() => { setSelectedContact(conv.contact); setShowList(false); }}
                    className={`flex w-full items-start gap-3 border-b border-cream-200 px-4 py-3 text-left transition-colors hover:bg-cream-50/80 ${
                      activeConversation?.contact === conv.contact ? 'bg-cream-100' : ''
                    }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cream-200 text-stone-600">
                      <Icon name="user" size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold text-ink text-sm">{displayContact(conv.contact)}</span>
                        <span className="shrink-0 font-mono text-[10px] text-stone-400">{formatDate(conv.lastMessage.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-stone-500">{conv.lastMessage.preview || 'Media or unsupported message'}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="flex min-h-32 flex-col items-center justify-center px-5 text-center">
                  <p className="text-xs text-stone-500">No messages yet. Start a new chat.</p>
                </div>
              )}
            </nav>
            <div className="flex items-center justify-between border-t border-cream-200 bg-cream-50 px-4 py-2">
              <button
                type="button"
                className="btn-secondary min-h-8 px-2.5 py-1 text-[10px]"
                disabled={page <= 1 || loadingMessages}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <Icon name="arrow-left" size={12} /> Prev
              </button>
              <span className="font-mono text-[10px] text-stone-500">Page {page}</span>
              <button
                type="button"
                className="btn-secondary min-h-8 px-2.5 py-1 text-[10px]"
                disabled={page >= totalPages || loadingMessages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next <Icon name="arrow-right" size={12} />
              </button>
            </div>
          </aside>
        )}

        <main className={`flex min-w-0 flex-1 flex-col ${showList ? 'hidden md:flex' : 'flex'}`}>
          {activeConversation || selectedContact ? (
            <>
              <div className="flex items-center gap-3 border-b border-cream-200 bg-cream-50 px-4 py-3">
                <button
                  type="button"
                  className="md:hidden"
                  onClick={() => setShowList(true)}
                  aria-label="Back to conversations"
                >
                  <Icon name="arrow-left" size={18} />
                </button>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cream-200 text-stone-600">
                  <Icon name="user" size={14} />
                </span>
                <span className="truncate font-semibold text-ink text-sm">{selectedContact ? displayContact(selectedContact) : ''}</span>
                {connected ? (
                  <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" title="Connected" />
                ) : (
                  <span className="ml-auto h-2 w-2 rounded-full bg-stone-400" title="Not connected" />
                )}
              </div>

              <div className="flex-1 overflow-y-auto bg-[#e5ddd5] px-4 py-4" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23c5b9b0\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'}}>
                <div className="mx-auto max-w-2xl space-y-1">
                  {activeConversation ? activeConversation.messages.map((msg) => {
                    const isIncoming = msg.direction === 'INBOUND';
                    return (
                      <div key={msg.id} className={`flex ${isIncoming ? 'justify-start' : 'justify-end'} items-end gap-1`}>
                        {isIncoming && <div className="w-2 shrink-0" />}
                        <div className="flex max-w-[80%] flex-col">
                          {isIncoming && msg.sender ? (
                            <span className="mb-0.5 ml-1 font-mono text-[10px] text-stone-500">{displayContact(msg.sender)}</span>
                          ) : null}
                          <div
                            className={`rounded-lg px-3 py-2 text-sm leading-relaxed shadow-xs ${
                              isIncoming
                                ? 'rounded-bl-sm bg-white text-stone-800'
                                : 'rounded-br-sm bg-[#d9fdd3] text-stone-800'
                            }`}
                          >
                          <p className="whitespace-pre-wrap break-words">{msg.preview || 'Message content not available'}</p>
                          <div className={`mt-0.5 flex items-center gap-1 ${isIncoming ? 'justify-start' : 'justify-end'}`}>
                            <span className="font-mono text-[10px] text-stone-400">{formatDate(msg.createdAt)}</span>
                            {!isIncoming && (
                              <span className="text-stone-400">
                                {msg.status === 'READ' || msg.status === 'DELIVERED' || msg.status === 'SENT' ? (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={msg.status === 'READ' ? '#53bdeb' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round"><path d="M2 7l3 3 7-7" /></svg>
                                ) : msg.status === 'FAILED' ? (
                                  <Icon name="warning" size={12} />
                                ) : (
                                  <Icon name="clock" size={12} />
                                )}
                              </span>
                            )}
                          </div>
                          {msg.error?.message && (
                            <p className="mt-1 rounded bg-red-50 px-2 py-1 text-[10px] leading-4 text-red-700">{msg.error.message}</p>
                          )}
                        </div>
                      </div>
                        {!isIncoming && <div className="w-2 shrink-0" />}
                      </div>
                    );
                  }) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-white/60 text-stone-400 mx-auto">
                        <Icon name="message" size={24} />
                      </span>
                      <p className="mt-3 text-sm text-stone-500">No messages with this contact yet.<br />Send the first message below.</p>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>

              <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-cream-300 bg-cream-50 px-4 py-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => { setInputText(e.target.value); setSendError(''); }}
                    placeholder="Type a message..."
                    className="input w-full rounded-full pr-4"
                    maxLength={4000}
                    disabled={sending}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:bg-cream-300 disabled:text-stone-400"
                  disabled={!inputText.trim() || sending || !connected}
                  title="Send"
                >
                  {sending ? (
                    <span className="spinner h-4 w-4 border-2" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2L11 13" />
                      <path d="M22 2l-7 20-4-9-9-4z" />
                    </svg>
                  )}
                </button>
              </form>
              {sendError ? (
                <div className="border-t border-cream-300 bg-red-50 px-4 py-2">
                  <p className="text-xs font-semibold text-red-800">Send failed</p>
                  <p className="mt-0.5 text-xs leading-5 text-red-700 font-mono break-all">{sendError}</p>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-[#e5ddd5]">
              <div className="text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cream-200 text-stone-400">
                  <Icon name="message" size={28} />
                </span>
                <p className="mt-3 text-sm text-stone-500">
                  {loadingMessages ? 'Loading...' : 'Select a conversation'}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

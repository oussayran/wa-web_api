export type ConnectionStatus =
  | 'DISCONNECTED'
  | 'INITIALIZING'
  | 'WAITING_FOR_QR'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'LOGGED_OUT'
  | 'ERROR';

export type MessageStatus = 'QUEUED' | 'ACCEPTED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface Admin {
  id: string;
  email: string;
  role: 'ADMIN';
}

export interface WhatsAppInstance {
  id: string;
  name: string;
  status: ConnectionStatus;
  connectedPhone: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  lastErrorMessage: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface NumberCheckResult {
  input: string;
  normalizedNumber: string;
  exists: boolean;
  jid?: string;
  reason?: string;
}

export interface SendResult {
  success: true;
  messageId: string;
  status: MessageStatus;
  recipient: string;
  createdAt: string;
  recordId: string;
  duplicate: boolean;
}

export interface MessageRecord {
  id: string;
  recipient: string;
  preview: string | null;
  status: MessageStatus;
  error: { code: string | null; message: string } | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface MessagePage {
  items: MessageRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface WhatsAppStatusEvent {
  event: 'whatsapp.status';
  instanceId: string;
  status: ConnectionStatus;
  timestamp: string;
}

export interface WhatsAppQrEvent {
  event: 'whatsapp.qr';
  instanceId: string;
  qrImageDataUrl: string;
  expiresAt: string;
}

export interface WhatsAppConnectedEvent {
  event: 'whatsapp.connected';
  instanceId: string;
  status: 'CONNECTED';
  connectedPhone?: string;
  timestamp: string;
}

export interface WhatsAppDisconnectedEvent {
  event: 'whatsapp.disconnected';
  instanceId: string;
  status: ConnectionStatus;
  timestamp: string;
}

export interface WhatsAppErrorEvent {
  event: 'whatsapp.error';
  instanceId: string;
  code: string;
  message: string;
  timestamp: string;
}

export interface MessageStatusEvent {
  event: 'message.status';
  instanceId: string;
  externalMessageId: string;
  status: Extract<MessageStatus, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'>;
  timestamp: string;
}

export type ConnectionStatus =
  | 'DISCONNECTED'
  | 'INITIALIZING'
  | 'WAITING_FOR_QR'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'LOGGED_OUT'
  | 'ERROR';

export interface WhatsAppNumberCheckResult {
  input: string;
  normalizedNumber: string;
  exists: boolean;
  jid?: string;
  reason?: string;
}

export interface SendMessageResult {
  success: true;
  messageId: string;
  status: 'QUEUED' | 'ACCEPTED' | 'SENT' | 'DELIVERED' | 'READ';
  recipient: string;
  createdAt: string;
}

export interface QrSnapshot {
  qrImageDataUrl: string;
  expiresAt: string;
}

export type ProviderEvent =
  | { event: 'whatsapp.status'; instanceId: string; status: ConnectionStatus; timestamp: string }
  | { event: 'whatsapp.qr'; instanceId: string; qrImageDataUrl: string; expiresAt: string }
  | { event: 'whatsapp.connected'; instanceId: string; status: 'CONNECTED'; connectedPhone?: string; timestamp: string }
  | { event: 'whatsapp.disconnected'; instanceId: string; status: ConnectionStatus; timestamp: string }
  | { event: 'whatsapp.error'; instanceId: string; code: string; message: string; timestamp: string }
  | { event: 'message.status'; instanceId: string; externalMessageId: string; status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; timestamp: string }
  | { event: 'message.new'; instanceId: string; externalMessageId: string; senderJid: string; senderNumber: string; text: string; timestamp: string };

export interface WhatsAppProvider {
  initialize(): Promise<void>;
  createConnection(instanceId: string): Promise<void>;
  connect(instanceId: string): Promise<void>;
  disconnect(instanceId: string): Promise<void>;
  logout(instanceId: string): Promise<void>;
  deleteInstance(instanceId: string): Promise<void>;
  removeAuthState(instanceId: string): Promise<void>;
  getStatus(instanceId: string): ConnectionStatus;
  getQrSnapshot(instanceId: string): QrSnapshot | undefined;
  checkNumber(instanceId: string, phoneNumber: string): Promise<WhatsAppNumberCheckResult>;
  sendText(instanceId: string, recipient: string, text: string): Promise<SendMessageResult>;
  sendTextMessage(instanceId: string, recipient: string, text: string): Promise<SendMessageResult>;
  destroy(): Promise<void>;
}

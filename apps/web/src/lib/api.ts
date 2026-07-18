import type {
  Admin,
  MessagePage,
  NumberCheckResult,
  SendResult,
  WhatsAppInstance,
} from '../types';

export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  requestId: string;
}

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

let sessionCsrfToken: string | null = null;

function readCookie(name: string): string | null {
  const prefix = `${encodeURIComponent(name)}=`;
  const match = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return null;
  }
}

export function rememberCsrfToken(token: string | null): void {
  sessionCsrfToken = token;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const isMutation = method === 'POST' || method === 'DELETE';
  const headers: Record<string, string> = { ...options.headers };

  if (isMutation) {
    headers['content-type'] = 'application/json';
    const csrfToken = readCookie('wa_csrf') ?? sessionCsrfToken;
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers,
      ...(isMutation ? { body: JSON.stringify(options.body ?? {}) } : {}),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'The API could not be reached. Check the service and try again.', 0);
  }

  let payload: SuccessEnvelope<T> | ErrorEnvelope;
  try {
    payload = (await response.json()) as SuccessEnvelope<T> | ErrorEnvelope;
  } catch {
    throw new ApiError('INVALID_RESPONSE', 'The API returned an unreadable response.', response.status);
  }

  if (!response.ok || !payload.success) {
    const error = payload.success ? null : payload.error;
    throw new ApiError(error?.code ?? 'REQUEST_FAILED', error?.message ?? 'The request failed.', response.status, payload.requestId);
  }

  return payload.data;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ admin: Admin; csrfToken: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  me: () => request<{ admin: Admin }>('/api/v1/auth/me'),
  logout: () => request<{ loggedOut: true }>('/api/v1/auth/logout', { method: 'POST' }),
  instances: () => request<WhatsAppInstance[]>('/api/v1/whatsapp/instances'),
  instance: (instanceId: string) =>
    request<WhatsAppInstance>(`/api/v1/whatsapp/instances/${encodeURIComponent(instanceId)}`),
  createInstance: (instanceId: string, name: string) =>
    request<WhatsAppInstance>('/api/v1/whatsapp/instances', {
      method: 'POST',
      body: { instanceId, name },
    }),
  connect: (instanceId: string) =>
    request<{ instanceId: string; status: string }>(
      `/api/v1/whatsapp/instances/${encodeURIComponent(instanceId)}/connect`,
      { method: 'POST' },
    ),
  disconnect: (instanceId: string) =>
    request<{ instanceId: string; status: string }>(
      `/api/v1/whatsapp/instances/${encodeURIComponent(instanceId)}/disconnect`,
      { method: 'POST' },
    ),
  logoutInstance: (instanceId: string) =>
    request<{ instanceId: string; status: string }>(
      `/api/v1/whatsapp/instances/${encodeURIComponent(instanceId)}/logout`,
      { method: 'POST' },
    ),
  checkNumber: (instanceId: string, phoneNumber: string) =>
    request<NumberCheckResult>(
      `/api/v1/whatsapp/instances/${encodeURIComponent(instanceId)}/check-number`,
      { method: 'POST', body: { phoneNumber } },
    ),
  sendText: (instanceId: string, phoneNumber: string, message: string, idempotencyKey: string) =>
    request<SendResult>(
      `/api/v1/whatsapp/instances/${encodeURIComponent(instanceId)}/messages/text`,
      {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: { phoneNumber, message, recipientConsentConfirmed: true },
      },
    ),
  messages: (instanceId: string, page: number, status: string) => {
    const query = new URLSearchParams({ page: String(page), limit: '20' });
    if (status) query.set('status', status);
    return request<MessagePage>(
      `/api/v1/whatsapp/instances/${encodeURIComponent(instanceId)}/messages?${query.toString()}`,
    );
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}

import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from './api';

function socketOrigin(): string {
  if (!API_BASE_URL) return window.location.origin;
  return new URL(API_BASE_URL, window.location.origin).origin;
}

export function createAuthenticatedSocket(): Socket {
  return io(socketOrigin(), {
    withCredentials: true,
    autoConnect: true,
  });
}

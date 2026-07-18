import type { ProviderEvent } from './whatsapp.types.js';

type Listener = (event: ProviderEvent) => void;

export class ProviderEventBus {
  private readonly listeners = new Set<Listener>();

  emit(event: ProviderEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

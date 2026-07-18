export class Mutex {
  private current: Promise<void> = Promise.resolve();

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    let release: () => void = () => undefined;
    const previous = this.current;
    this.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export class InstanceMutexes {
  private readonly mutexes = new Map<string, Mutex>();

  for(instanceId: string): Mutex {
    const existing = this.mutexes.get(instanceId);
    if (existing) return existing;
    const mutex = new Mutex();
    this.mutexes.set(instanceId, mutex);
    return mutex;
  }
}

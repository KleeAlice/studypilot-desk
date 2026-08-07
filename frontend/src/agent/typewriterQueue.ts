export interface TypewriterQueue {
  enqueue(text: string): void;
  drain(): Promise<void>;
  cancel(): void;
}


export function createTypewriterQueue(
  reveal: (text: string) => void,
  intervalMs = 14,
): TypewriterQueue {
  let pending = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let charactersPerTick = 1;
  let cancelled = false;
  let drainResolvers: Array<() => void> = [];

  function resolveDrains() {
    if (pending || timer) return;
    const resolvers = drainResolvers;
    drainResolvers = [];
    resolvers.forEach((resolve) => resolve());
  }

  function pump() {
    timer = null;
    if (cancelled) {
      pending = "";
      resolveDrains();
      return;
    }
    if (!pending) {
      charactersPerTick = 1;
      resolveDrains();
      return;
    }
    const chunk = pending.slice(0, charactersPerTick);
    pending = pending.slice(charactersPerTick);
    reveal(chunk);
    timer = setTimeout(pump, intervalMs);
  }

  return {
    enqueue(text) {
      if (cancelled || !text) return;
      pending += text;
      charactersPerTick = Math.max(charactersPerTick, Math.ceil(pending.length / 36));
      if (!timer) pump();
    },
    drain() {
      if (!pending && !timer) return Promise.resolve();
      return new Promise<void>((resolve) => drainResolvers.push(resolve));
    },
    cancel() {
      cancelled = true;
      pending = "";
      charactersPerTick = 1;
      if (timer) clearTimeout(timer);
      timer = null;
      resolveDrains();
    },
  };
}

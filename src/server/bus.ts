import type { ListEvent } from "@/shared/types";

type Listener = (event: ListEvent) => void;

/**
 * In-memory pub/sub. A household lives in exactly one Durable Object instance,
 * so every open SSE stream for that household subscribes to the same bus.
 */
export class EventBus {
  private listeners = new Set<Listener>();

  emit(event: ListEvent) {
    for (const listener of this.listeners) listener(event);
  }

  /** Yields events until `signal` aborts. */
  async *subscribe(signal: AbortSignal | undefined): AsyncGenerator<ListEvent> {
    const queue: ListEvent[] = [];
    let wake: (() => void) | null = null;
    const listener: Listener = (event) => {
      queue.push(event);
      wake?.();
    };
    const onAbort = () => wake?.();
    this.listeners.add(listener);
    signal?.addEventListener("abort", onAbort);
    try {
      while (!signal?.aborted) {
        const next = queue.shift();
        if (next) {
          yield next;
          continue;
        }
        await new Promise<void>((resolve) => (wake = resolve));
        wake = null;
      }
    } finally {
      this.listeners.delete(listener);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

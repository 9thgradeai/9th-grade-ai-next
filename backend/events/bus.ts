// backend/events/bus.ts — lightweight domain event bus (Phase 11).
//
// Default driver: in-process synchronous-ish dispatch (fire-and-forget, never
// throws into the emitting service). The emit() signature is the ONLY thing
// that changes when events move onto a queue (Phase 16 interface / Phase 24
// workers): publishers stay `emit(event)` forever.

import "server-only";

import { runAfterResponse } from "~backend/schedule";
import type { DomainEvent, DomainEventName, EventHandler } from "./types";

type AnyHandler = (event: DomainEvent) => void | Promise<void>;

const handlers = new Map<DomainEventName, Set<AnyHandler>>();

export function subscribe<T extends DomainEventName>(
  name: T,
  handler: EventHandler<T>,
): () => void {
  let set = handlers.get(name);
  if (!set) {
    set = new Set();
    handlers.set(name, set);
  }
  const wrapped = handler as AnyHandler;
  set.add(wrapped);
  return () => set!.delete(wrapped);
}

/**
 * Fire-and-forget publish. A failing subscriber is logged and isolated —
 * it can NEVER break the business operation that produced the event.
 * Handlers run via runAfterResponse so they survive serverless response
 * completion (badge awards etc. are not dropped on Vercel).
 */
export function emit(event: DomainEvent): void {
  const set = handlers.get(event.name);
  if (!set || set.size === 0) return;
  for (const handler of set) {
    runAfterResponse(async () => {
      try {
        await handler(event);
      } catch (err) {
        console.error(
          `[events] handler failed for ${event.name}:`,
          err instanceof Error ? err.message : err,
        );
      }
    });
  }
}

/** Test hook. */
export function clearSubscriptions(): void {
  handlers.clear();
}

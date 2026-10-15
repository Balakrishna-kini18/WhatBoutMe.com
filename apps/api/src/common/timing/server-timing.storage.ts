import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestTimingContext {
  startTime: number;
  dbDuration: number;
  queryCount: number;
}

export const requestTimingStorage = new AsyncLocalStorage<RequestTimingContext>();

export function recordDbDuration(durationMs: number) {
  const store = requestTimingStorage.getStore();
  if (store) {
    store.dbDuration += durationMs;
    store.queryCount += 1;
  }
}

export function getTimingContext(): RequestTimingContext | undefined {
  return requestTimingStorage.getStore();
}

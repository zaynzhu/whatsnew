import { AsyncLocalStorage } from "node:async_hooks"

const sourceSyncSignals = new AsyncLocalStorage<AbortSignal>()

export function currentSourceSyncSignal(): AbortSignal | undefined {
  return sourceSyncSignals.getStore()
}

export function runWithSourceSyncSignal<T>(
  signal: AbortSignal,
  callback: () => Promise<T>
): Promise<T> {
  return sourceSyncSignals.run(signal, callback)
}

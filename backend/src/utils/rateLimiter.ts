export class RateLimiter {
  private lastRunAt = 0
  private queue = Promise.resolve()

  constructor(private readonly minIntervalMs: number) {}

  run<T>(job: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(async () => {
      const now = Date.now()
      const waitMs = Math.max(0, this.lastRunAt + this.minIntervalMs - now)
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      }
      this.lastRunAt = Date.now()
      return job()
    })
    this.queue = next.then(() => undefined, () => undefined)
    return next
  }
}

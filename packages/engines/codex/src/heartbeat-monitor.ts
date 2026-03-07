export class HeartbeatMonitor {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout: () => void,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('HeartbeatMonitor timeout must be a positive number');
    }
  }

  reset(): void {
    this.stop();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.onTimeout();
    }, this.timeoutMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

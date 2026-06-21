export class FpsMeter {
  private ema: number | null = null;
  private last: number | null = null;
  constructor(private alpha = 0.1) {}

  tick(nowMs: number): void {
    if (this.last !== null) {
      const dt = nowMs - this.last;
      if (dt > 0) {
        const inst = 1000 / dt;
        this.ema = this.ema === null ? inst : this.alpha * inst + (1 - this.alpha) * this.ema;
      }
    }
    this.last = nowMs;
  }

  value(): number {
    return this.ema ?? 0;
  }
}

export class LatencyMeter {
  private ema: number | null = null;
  constructor(private alpha = 0.1) {}

  record(ms: number): void {
    this.ema = this.ema === null ? ms : this.alpha * ms + (1 - this.alpha) * this.ema;
  }

  avg(): number {
    return this.ema ?? 0;
  }
}

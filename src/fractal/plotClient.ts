/**
 * Main-thread side of plotting: asks the worker for rasters, reports progress, caches results.
 * Falls back to time-sliced main-thread plotting if workers are unavailable.
 */
import { PLOT_H, PLOT_W, type PlotSpec, computeRows, plotKey } from './mandelbrot';

export type RowsCallback = (row0: number, rows: number, counts: Uint16Array) => void;

interface Job {
  id: number;
  key: string;
  counts: Uint16Array;
  onRows: RowsCallback;
  resolve: (c: Uint16Array) => void;
  reject: (e: Error) => void;
  started: number;
}

export class PlotCancelled extends Error {}

export class PlotClient {
  private worker: Worker | null = null;
  private job: Job | null = null;
  private nextId = 1;
  private readonly cache = new Map<string, Uint16Array>();
  /** milliseconds the last plot took */
  lastMs = 0;

  constructor() {
    try {
      this.worker = new Worker(new URL('./plot.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.onMessage(e.data);
      this.worker.onerror = () => {
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  cached(spec: PlotSpec): Uint16Array | null {
    return this.cache.get(plotKey(spec)) ?? null;
  }

  get busy(): boolean {
    return this.job !== null;
  }

  /** Plot `spec`; rows are reported as they arrive. A new request cancels the previous one. */
  plot(spec: PlotSpec, onRows: RowsCallback = () => {}): Promise<Uint16Array> {
    const key = plotKey(spec);
    const hit = this.cache.get(key);
    if (hit) {
      onRows(0, PLOT_H, hit);
      return Promise.resolve(hit);
    }
    this.cancel();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.job = { id, key, counts: new Uint16Array(PLOT_W * PLOT_H), onRows, resolve, reject, started: performance.now() };
      if (this.worker) this.worker.postMessage({ id, spec });
      else void this.fallback(id, spec);
    });
  }

  cancel(): void {
    if (!this.job) return;
    const j = this.job;
    this.job = null;
    this.worker?.postMessage({ cancel: j.id });
    j.reject(new PlotCancelled('cancelled'));
  }

  private onMessage(m: { id: number; row0?: number; rows?: number; data?: Uint16Array; done?: boolean }): void {
    const j = this.job;
    if (!j || m.id !== j.id) return;
    if (m.data && m.row0 !== undefined && m.rows) {
      j.counts.set(m.data, m.row0 * PLOT_W);
      j.onRows(m.row0, m.rows, j.counts);
    }
    if (m.done) this.complete(j);
  }

  private complete(j: Job): void {
    this.job = null;
    this.lastMs = performance.now() - j.started;
    this.cache.set(j.key, j.counts);
    while (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value!);
    j.resolve(j.counts);
  }

  private async fallback(id: number, spec: PlotSpec): Promise<void> {
    for (let r = 0; r < PLOT_H; r += 8) {
      const j = this.job;
      if (!j || j.id !== id) return;
      computeRows(spec, r, r + 8, j.counts.subarray(r * PLOT_W, (r + 8) * PLOT_W), r);
      j.onRows(r, 8, j.counts);
      await new Promise((res) => setTimeout(res, 0));
    }
    if (this.job?.id === id) this.complete(this.job);
  }
}

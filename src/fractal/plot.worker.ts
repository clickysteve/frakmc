/// <reference lib="webworker" />
/**
 * Plot worker: computes plot rasters off the main thread in small row slices, yielding between
 * slices so a newer request can cancel an older one. Keeps fractal work away from the MIDI
 * scheduler and the UI.
 */
import { PLOT_H, PLOT_W, type PlotSpec, computeRows } from './mandelbrot';

const ROWS = 8;
let current = 0;

self.onmessage = async (e: MessageEvent<{ id: number; spec: PlotSpec } | { cancel: number }>) => {
  const msg = e.data;
  if ('cancel' in msg) {
    if (current === msg.cancel) current = 0;
    return;
  }
  const { id, spec } = msg;
  current = id;
  for (let r = 0; r < PLOT_H; r += ROWS) {
    if (current !== id) return;
    const n = Math.min(ROWS, PLOT_H - r);
    const out = new Uint16Array(PLOT_W * n);
    computeRows(spec, r, r + n, out, r);
    (self as unknown as Worker).postMessage({ id, row0: r, rows: n, data: out }, [out.buffer]);
    await new Promise((res) => setTimeout(res, 0));
  }
  if (current === id) (self as unknown as Worker).postMessage({ id, done: true });
};

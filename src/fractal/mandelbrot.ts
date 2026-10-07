/**
 * Mandelbrot iteration and plot geometry, following FMC2's behaviour. Pure functions; no DOM.
 *
 * `fmcCount` reproduces the iteration behaviour of the original (docs/BEHAVIOUR.md
 * §2.2): Q27 fixed point, bailout x²+y² > 4 compared as an unsigned 32-bit value, and a
 * *descending* result — maxIter for a point that escapes at once, 0 for a point that never
 * escapes. That descending count is what the composer turns into notes and durations, which
 * is why the black "pool" of the set always gives the lowest note and the first duration.
 */
import { mulQ27 } from './fixed';

export type Iterations = 72 | 144 | 288;
export const ITERATION_CHOICES: readonly Iterations[] = [72, 144, 288];

/** Plot raster size (Atari ST high resolution). */
export const PLOT_W = 640;
export const PLOT_H = 400;

/** A plot window: Q27 integers (y0, dy, x0, dx), the same quantities an FMC2 .DMP file stores. */
export interface PlotWindow {
  y0: number;
  dy: number;
  x0: number;
  dx: number;
}

export interface PlotSpec extends PlotWindow {
  name: string;
  iterations: Iterations;
}

/**
 * FrakMC's default plot: the whole set, real −2.25…+0.75 by imaginary −1.5…+1.5 on 640×400,
 * 72 iterations. Chosen for FrakMC (it matches the fixed screen-to-c mapping that FMC2's Julia
 * composer uses, so a Julia click lands exactly where it appears to); not taken from any
 * original plot file.
 */
export const FULLSET: PlotSpec = {
  name: 'FULLSET',
  y0: -201326592, //  −1.5
  dy: 1006633, //     3.0 / 400
  x0: -301989888, //  −2.25
  dx: 629146, //      3.0 / 640
  iterations: 72,
};

const BAILOUT = 0x20000000; // 4.0 in Q27

/** FMC count at c = (cr, ci) (Q27): maxIter − i for escape at 0-based iteration i, 0 if none. */
export function fmcCount(cr: number, ci: number, maxIter: number): number {
  let x = 0, y = 0, x2 = 0, y2 = 0;
  for (let n = maxIter - 1; n >= 0; n--) {
    const t = (x2 - y2 + cr) | 0;
    y = ((mulQ27(x, y) << 1) + ci) | 0;
    x = t;
    x2 = mulQ27(x, x);
    y2 = mulQ27(y, y);
    if (((x2 + y2) >>> 0) > BAILOUT) return n + 1;
  }
  return 0;
}

/** Real part (Q27) of column `col`. 32-bit wrap, like the original's repeated addition. */
export function colToCr(w: PlotWindow, col: number): number {
  return (w.x0 + col * w.dx) | 0;
}

/** Imaginary part (Q27) of row `row`. */
export function rowToCi(w: PlotWindow, row: number): number {
  return (w.y0 + row * w.dy) | 0;
}

/** FMC count of one plot pixel. */
export function pixelCount(p: PlotSpec, col: number, row: number): number {
  return fmcCount(colToCr(p, col), rowToCi(p, row), p.iterations);
}

/**
 * Compute rows [row0, row1) of a plot into `out` (row-major, PLOT_W per row).
 * Used by the plot worker in slices so progress can be shown.
 */
export function computeRows(p: PlotSpec, row0: number, row1: number, out: Uint16Array, outOffsetRow = row0): void {
  for (let r = row0; r < row1; r++) {
    const ci = rowToCi(p, r);
    const base = (r - outOffsetRow) * PLOT_W;
    for (let c = 0; c < PLOT_W; c++) out[base + c] = fmcCount(colToCr(p, c), ci, p.iterations);
  }
}

/** The whole plot (synchronous; tests and small tools — the UI uses the worker). */
export function computePlot(p: PlotSpec): Uint16Array {
  const out = new Uint16Array(PLOT_W * PLOT_H);
  computeRows(p, 0, PLOT_H, out);
  return out;
}

/**
 * The original's plotting pen for a pixel: (10 − k) mod nColours (VDI pen numbering), where k is
 * the 1-based escape iteration, or maxIter + 1 inside the set. docs/BEHAVIOUR.md §2.3.
 */
export function plotPen(count: number, maxIter: number, nColours: number): number {
  const k = count === 0 ? maxIter + 1 : maxIter - count + 1;
  return (((10 - k) % nColours) + nColours) % nColours;
}

/** GEM maps VDI pens to palette registers: mono identity; 4 colours 0,1,2,3 → 0,3,1,2. */
export const VDI_TO_REGISTER_4 = [0, 3, 1, 2] as const;

export class ZoomTooDeep extends Error {
  constructor() {
    super('Cannot zoom further: the plot has reached the limit of its precision');
  }
}

/**
 * New plot window for a dragged box (pixel corners, inclusive top-left, bottom-right = top-left
 * + size), computed as the original does (docs/BEHAVIOUR.md §2.4). Throws ZoomTooDeep when the
 * new step would truncate to zero.
 */
export function zoomWindow(w: PlotWindow, left: number, top: number, right: number, bottom: number,
  width = PLOT_W, height = PLOT_H): PlotWindow {
  const yEnd = w.y0 + height * w.dy;
  const xEnd = w.x0 + width * w.dx;
  const ny0 = Math.trunc(w.y0 + ((yEnd - w.y0) * top) / height);
  const yB = w.y0 + ((yEnd - w.y0) * bottom) / height;
  const nx0 = Math.trunc(w.x0 + ((xEnd - w.x0) * left) / width);
  const xR = w.x0 + ((xEnd - w.x0) * right) / width;
  const ndy = Math.trunc((yB - ny0) / height);
  const ndx = Math.trunc((xR - nx0) / width);
  if (ndy === 0 || ndx === 0) throw new ZoomTooDeep();
  return { y0: ny0 | 0, dy: ndy | 0, x0: nx0 | 0, dx: ndx | 0 };
}

/** Stable key for caching rasters. */
export function plotKey(p: PlotSpec): string {
  return `${p.y0},${p.dy},${p.x0},${p.dx},${p.iterations}`;
}

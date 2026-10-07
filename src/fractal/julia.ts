/**
 * Julia patterns for the Julia composer: inverse iteration z ← ±√(z − c) in floating point,
 * the root chosen by drand48() > 0.5 (docs/BEHAVIOUR.md §2.5). Pure; no DOM.
 */
import type { Drand48 } from './drand48';
import { PLOT_H, PLOT_W, type PlotSpec, colToCr, rowToCi } from './mandelbrot';
import { fromQ27 } from './fixed';

/** Horizontal screen scale of a pattern: sx = trunc(48·x). OBSERVED. */
export const JULIA_X_SCALE = 48;
/** Vertical screen scale: sy = trunc((2 − y)·Ys). UNKNOWN in the original (UNCERTAINTIES U1). */
export const JULIA_Y_SCALE = 50;
/** Right shift applied to sy for velocity. UNKNOWN (U1). */
export const JULIA_VEL_SHIFT = 2;

/** The original's slightly-off π/2 (0x3FF921F4B1EE2435) for w.re == 0. */
const HALF_PI_FMC = 1.570796;

export interface Complex {
  re: number;
  im: number;
}

/**
 * c for a click at plot pixel (px, py). The original ignores the plot window and uses a fixed
 * map onto −2.25…0.75 × −1.5…1.5 ("Julia sets really only correspond to points on HIPLOT01").
 * With `fromPlot`, the loaded plot's real coordinates are used instead (a modern option).
 */
export function juliaC(px: number, py: number, plot: PlotSpec, fromPlot: boolean): Complex {
  if (fromPlot) return { re: fromQ27(colToCr(plot, px)), im: fromQ27(rowToCi(plot, py)) };
  return { re: -2.25 + px * (3 / PLOT_W), im: -1.5 + py * (3 / PLOT_H) };
}

/** One track's inverse-iteration walker. */
export class JuliaWalker {
  x = 2;
  y = 2;
  sx = 0;
  sy = 0;

  constructor(readonly c: Complex, private rng: Drand48) {}

  step(): void {
    const a = this.x - this.c.re;
    const b = this.y - this.c.im;
    let theta: number;
    if (a === 0) theta = HALF_PI_FMC;
    else {
      theta = Math.atan(b / a);
      if (a < 0) theta += Math.PI;
    }
    theta /= 2;
    let r = Math.sqrt(Math.sqrt(a * a + b * b));
    if (!(this.rng.next() > 0.5)) r = -r;
    this.x = Math.cos(theta) * r;
    this.y = Math.sin(theta) * r;
    this.sx = Math.trunc(this.x * JULIA_X_SCALE);
    this.sy = Math.trunc((2 - this.y) * JULIA_Y_SCALE);
  }
}

export interface JuliaTrackSetup {
  walker: JuliaWalker;
  /** note index = trunc((sx + off)·k), negative → 0 */
  k: number;
  off: number;
}

/**
 * Set a track up as the original does: 30 warm-up steps, 40 steps measuring the horizontal
 * extent, then a scale that spreads that extent over the track's range of `rangeSemis`.
 */
export function setupJuliaTrack(c: Complex, rng: Drand48, rangeSemis: number): JuliaTrackSetup {
  const walker = new JuliaWalker(c, rng);
  for (let i = 0; i < 30; i++) walker.step();
  let max = 0;
  let min = 200;
  for (let i = 0; i < 40; i++) {
    walker.step();
    if (walker.sx > max) max = walker.sx;
    if (walker.sx < min) min = walker.sx;
  }
  const absMin = Math.abs(min);
  const span = absMin + max;
  const r24 = rangeSemis / 24;
  const k = span === 0 ? 0 : (rangeSemis + r24) / span;
  const off = Math.trunc(absMin - r24);
  return { walker, k, off };
}

export function juliaNoteIndex(s: JuliaTrackSetup): number {
  const idx = Math.trunc((s.walker.sx + s.off) * s.k);
  return idx < 0 ? 0 : idx;
}

/** Julia velocity part: 2·(65 − (sy >> shift)). */
export function juliaVelocity(sy: number): number {
  return 2 * (65 - (sy >> JULIA_VEL_SHIFT));
}

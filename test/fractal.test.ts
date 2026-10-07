import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mulQ27, ONE, toQ27 } from '../src/fractal/fixed';
import {
  FULLSET, PLOT_H, PLOT_W, computePlot, computeRows, fmcCount, plotPen, pixelCount, zoomWindow, ZoomTooDeep,
} from '../src/fractal/mandelbrot';
import { Drand48 } from '../src/fractal/drand48';
import { juliaC, setupJuliaTrack } from '../src/fractal/julia';
import { decodeDmp } from '../src/persistence/fmcFiles';

function refMul(a: number, b: number): number {
  const p = BigInt(a) * BigInt(b);
  return Number(BigInt.asIntN(32, p >> 27n));
}

describe('Q27 fixed point', () => {
  it('matches a 64-bit reference including overflow wrap', () => {
    let s = 12345;
    const rnd = () => {
      s = (s * 1103515245 + 12345) >>> 0;
      return (s ^ (s << 7)) | 0;
    };
    const special = [0, 1, -1, ONE, -ONE, 0x7fffffff, -0x80000000, 0x20000000, -0x20000000, 0x12345678];
    for (const a of special) for (const b of special) expect(mulQ27(a, b)).toBe(refMul(a, b));
    for (let i = 0; i < 20000; i++) {
      const a = rnd(), b = rnd();
      expect(mulQ27(a, b)).toBe(refMul(a, b));
    }
  });
  it('multiplies ordinary values', () => {
    expect(mulQ27(toQ27(1.5), toQ27(2))).toBe(toQ27(3));
    expect(mulQ27(toQ27(-0.5), toQ27(0.5))).toBe(toQ27(-0.25));
  });
});

describe('FMC Mandelbrot count', () => {
  it('is 0 inside the set and maxIter for immediate escape', () => {
    expect(fmcCount(0, 0, 72)).toBe(0);
    expect(fmcCount(toQ27(-1), 0, 144)).toBe(0);
    expect(fmcCount(toQ27(2.5), toQ27(2.5), 72)).toBe(72);
  });
  it('counts down with escape time', () => {
    // c = 0.3: escapes after a few dozen iterations
    const a = fmcCount(toQ27(0.3), 0, 72);
    const b = fmcCount(toQ27(0.5), 0, 72);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a); // escapes sooner → higher count
  });
  it('is deterministic for identical parameters', () => {
    const p = { ...FULLSET };
    const rowA = new Uint16Array(PLOT_W * 4), rowB = new Uint16Array(PLOT_W * 4);
    computeRows(p, 100, 104, rowA, 100);
    computeRows({ ...p }, 100, 104, rowB, 100);
    expect(rowA).toEqual(rowB);
  });
  it('known values on FULLSET', () => {
    expect(pixelCount(FULLSET, 400, 200)).toBe(0); // in the main cardioid
    expect(pixelCount(FULLSET, 0, 0)).toBe(72); // far corner
    expect(pixelCount(FULLSET, 545, 200)).toBeGreaterThan(0); // just right of the cusp
  });
});

describe('plot pens', () => {
  it('mono: set is pen 1, bands alternate', () => {
    expect(plotPen(0, 72, 2)).toBe(1);
    expect(plotPen(72, 72, 2)).toBe(1); // k = 1
    expect(plotPen(71, 72, 2)).toBe(0); // k = 2
  });
  it('4 colours cycle with period 4', () => {
    const pens = [72, 71, 70, 69, 68].map((c) => plotPen(c, 72, 4));
    expect(pens).toEqual([1, 0, 3, 2, 1]);
  });
});

describe('zoom', () => {
  it('maps a box to a new window', () => {
    const w = zoomWindow(FULLSET, 320, 200, 480, 300);
    expect(w.x0).toBe(Math.trunc(FULLSET.x0 + 320 * FULLSET.dx));
    expect(w.y0).toBe(Math.trunc(FULLSET.y0 + 200 * FULLSET.dy));
    expect(w.dx).toBe(Math.trunc((160 * FULLSET.dx) / PLOT_W));
    expect(w.dy).toBe(Math.trunc((100 * FULLSET.dy) / PLOT_H));
  });
  it('refuses to zoom too deep', () => {
    const tiny = { y0: 0, dy: 3, x0: 0, dx: 3 };
    expect(() => zoomWindow(tiny, 0, 0, 10, 10)).toThrow(ZoomTooDeep);
  });
});

describe('drand48', () => {
  it('follows the LCG from state 0', () => {
    const r = new Drand48();
    expect(r.next()).toBe(11 / 2 ** 48);
    const x2 = (0x5deece66dn * 11n + 0xbn) & ((1n << 48n) - 1n);
    expect(r.next()).toBe(Number(x2) / 2 ** 48);
    expect(r.state).toBe(x2.toString(16).padStart(12, '0'));
  });
  it('round-trips state', () => {
    const a = new Drand48('0123456789ab');
    a.next();
    const b = new Drand48(a.state);
    expect(b.next()).toBe(a.next());
  });
});

describe('Julia', () => {
  it('fixed c mapping matches the original', () => {
    expect(juliaC(0, 0, FULLSET, false)).toEqual({ re: -2.25, im: -1.5 });
    expect(juliaC(320, 200, FULLSET, false)).toEqual({ re: -0.75, im: 0 });
  });
  it('set-up is deterministic for a given generator state', () => {
    const a = setupJuliaTrack({ re: -0.75, im: 0.1 }, new Drand48(), 24);
    const b = setupJuliaTrack({ re: -0.75, im: 0.1 }, new Drand48(), 24);
    expect(a.k).toBe(b.k);
    expect(a.off).toBe(b.off);
    expect(a.k).toBeGreaterThan(0);
  });
});

const RES = 'research-sources/fmc2/';
describe.skipIf(!existsSync(RES + 'HIPLOT01.DMP'))('agreement with the original plots (research files present)', () => {
  for (const f of ['HIPLOT01', 'HIPLOT02', 'HIPLOT03']) {
    it(`reproduces ${f} bit for bit at 72 iterations`, { timeout: 60000 }, () => {
      const dmp = decodeDmp(new Uint8Array(readFileSync(RES + f + '.DMP')), f);
      const counts = computePlot({ ...dmp.spec, iterations: 72 });
      let diff = 0;
      for (let i = 0; i < counts.length; i++) if (plotPen(counts[i], 72, 2) !== dmp.pens![i]) diff++;
      expect(diff).toBe(0);
    });
  }
});

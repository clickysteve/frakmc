/**
 * Importers for the original FMC2 data files (docs/BEHAVIOUR.md §11), so owners of the
 * original disk can load their own plots, set-ups and scale sets. Big-endian 16-bit words.
 */
import { type Iterations, type PlotSpec } from '../fractal/mandelbrot';
import {
  type Box, CELL_REST, CELL_TIE, type MainSetup, type RhythmMap, type ScalePattern, type TonalityMap,
  MAX_LENGTHS, MAX_TONALITIES, MAX_TRACKS, MULTIPLIERS, SAME_NOTE_MODES, SCALE_COUNT, SCALE_ROWS, SLOTS,
  normMain, normRhythm, normTonality,
} from '../state/document';

export class FmcFileError extends Error {}

const s16 = (b: Uint8Array, o: number): number => {
  const v = (b[o] << 8) | b[o + 1];
  return v & 0x8000 ? v - 0x10000 : v;
};
const s32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) | 0;
const cstr = (b: Uint8Array, o: number, n: number): string => {
  let s = '';
  for (let i = 0; i < n && b[o + i]; i++) s += String.fromCharCode(b[o + i]);
  return s;
};

export interface DmpFile {
  spec: PlotSpec;
  /** pens of the stored screen (hi-res files only), 640×400 */
  pens: Uint8Array | null;
  resolution: 'high' | 'medium' | 'low';
}

/** A .DMP plot: 32000-byte screen + y0, dy, x0, dx, code. The iteration count is not stored. */
export function decodeDmp(bytes: Uint8Array, name: string, iterations: Iterations = 72): DmpFile {
  if (bytes.length !== 32020) throw new FmcFileError('Not an FMC plot (.DMP) file');
  const y0 = s32(bytes, 32000), dy = s32(bytes, 32004), x0 = s32(bytes, 32008), dx = s32(bytes, 32012), code = s32(bytes, 32016);
  if (!dy || !dx) throw new FmcFileError('Plot file has an empty window');
  const resolution = code === 12 ? 'high' : code === 9 ? 'low' : 'medium';
  let pens: Uint8Array | null = null;
  let spec: PlotSpec = { name: name.toUpperCase().replace(/\.DMP$/i, '').slice(0, 12), y0, dy, x0, dx, iterations };
  if (resolution === 'high') {
    pens = new Uint8Array(640 * 400);
    for (let i = 0; i < 32000; i++) for (let bit = 0; bit < 8; bit++) pens[i * 8 + bit] = (bytes[i] >> (7 - bit)) & 1;
  } else {
    // 200-line plots: keep the same complex window at 640×400 (UNCERTAINTIES U10)
    const w = resolution === 'low' ? 320 : 640;
    spec = { ...spec, dy: Math.trunc((dy * 200) / 400), dx: Math.trunc((dx * w) / 640) };
  }
  return { spec, pens, resolution };
}

/** SCALESET.SCA: 12 × (96 signed offsets + 10-byte name). */
export function decodeScaleSet(bytes: Uint8Array): ScalePattern[] {
  if (bytes.length !== SCALE_COUNT * 106) throw new FmcFileError('Not an FMC scale set (.SCA) file');
  const out: ScalePattern[] = [];
  for (let s = 0; s < SCALE_COUNT; s++) {
    const o = s * 106;
    const rows: number[][] = [];
    for (let r = 0; r < SCALE_ROWS; r++) {
      rows.push(Array.from({ length: 12 }, (_, c) => {
        const v = bytes[o + r * 12 + c];
        if (v === CELL_TIE || v === CELL_REST) return v;
        return Math.max(-12, Math.min(12, v > 127 ? v - 256 : v));
      }));
    }
    out.push({ name: cstr(bytes, o + 96, 10).toUpperCase() || `SCALE${s + 1}`, rows });
  }
  return out;
}

/** Encode a scale set in the original format (for round trips and for use on a real ST). */
export function encodeScaleSet(scales: ScalePattern[]): Uint8Array {
  const out = new Uint8Array(SCALE_COUNT * 106);
  scales.slice(0, SCALE_COUNT).forEach((sc, s) => {
    const o = s * 106;
    sc.rows.forEach((row, r) => row.forEach((v, c) => (out[o + r * 12 + c] = v & 0xff)));
    for (let i = 0; i < Math.min(9, sc.name.length); i++) out[o + 96 + i] = sc.name.charCodeAt(i) & 0x7f;
  });
  return out;
}

/** COMPSET.REC: 8 Main set-ups of 282 bytes. Empty (all-zero) slots become null. */
export function decodeCompset(bytes: Uint8Array): (MainSetup | null)[] {
  if (bytes.length !== SLOTS * 282) throw new FmcFileError('Not an FMC composer set-up (COMPSET.REC) file');
  const out: (MainSetup | null)[] = [];
  for (let s = 0; s < SLOTS; s++) {
    const o = s * 282;
    if (bytes.subarray(o, o + 282).every((b) => b === 0)) {
      out.push(null);
      continue;
    }
    const w = (i: number) => s16(bytes, o + i * 2);
    const tracks = Array.from({ length: MAX_TRACKS }, (_, t) => {
      const b = t * 9;
      return {
        chan: w(b), loOct: w(b + 1), loNote: w(b + 2), hiOct: w(b + 3), hiNote: w(b + 4), so: w(b + 5),
        sameNote: SAME_NOTE_MODES[w(b + 6)] ?? 'REP', disable: w(b + 7) !== 0, mute: w(b + 8) !== 0,
      };
    });
    const boxes: (Box | null)[] = Array.from({ length: 12 }, (_, k) => {
      const b = 54 + k * 4;
      const x1 = w(b), y1 = w(b + 1), x2 = w(b + 2), y2 = w(b + 3);
      return x1 || y1 || x2 || y2 ? { x1, y1, x2, y2 } : null;
    });
    const juliaPoints = Array.from({ length: MAX_TRACKS }, (_, t) => {
      const x = w(102 + t * 4), y = w(103 + t * 4);
      return x || y ? { x, y } : null;
    });
    out.push(normMain({
      tracks, boxes, juliaPoints,
      numTracks: w(126), fractalType: w(127) ? 'mandelbrot' : 'julia', ppqn: w(128) ? 192 : 96, midiType: w(129) ? 1 : 0,
      tempo: w(130), rhythmSlot: w(131), tonalitySlot: w(132), plotName: cstr(bytes, o + 266, 14).replace(/\.DMP$/i, ''),
    }));
  }
  return out;
}

/** RHYTHMS.REC: 8 × (6 × [type, N.REPS, n, 16 lengths] + multiplier index). */
export function decodeRhythms(bytes: Uint8Array): (RhythmMap | null)[] {
  if (bytes.length !== SLOTS * 230) throw new FmcFileError('Not an FMC rhythm (RHYTHMS.REC) file');
  const out: (RhythmMap | null)[] = [];
  for (let s = 0; s < SLOTS; s++) {
    const o = s * 230;
    if (bytes.subarray(o, o + 230).every((b) => b === 0)) {
      out.push(null);
      continue;
    }
    const w = (i: number) => s16(bytes, o + i * 2);
    out.push(normRhythm({
      tracks: Array.from({ length: MAX_TRACKS }, (_, t) => {
        const b = t * 19;
        return { type: w(b) ? 'SEQ' : 'DUR', nReps: w(b + 1), count: w(b + 2), lengths: Array.from({ length: MAX_LENGTHS }, (_, j) => w(b + 3 + j)) };
      }),
      multiplier: MULTIPLIERS[w(114)] ?? 8,
    }));
  }
  return out;
}

/** TONALITY.REC: 8 × (36 scales, 36 transposes, 36 quarter counts, count, global transpose). */
export function decodeTonalities(bytes: Uint8Array): (TonalityMap | null)[] {
  if (bytes.length !== SLOTS * 220) throw new FmcFileError('Not an FMC tonality (TONALITY.REC) file');
  const out: (TonalityMap | null)[] = [];
  for (let s = 0; s < SLOTS; s++) {
    const o = s * 220;
    if (bytes.subarray(o, o + 220).every((b) => b === 0)) {
      out.push(null);
      continue;
    }
    const w = (i: number) => s16(bytes, o + i * 2);
    out.push(normTonality({
      tonalities: Array.from({ length: MAX_TONALITIES }, (_, i) => ({ scale: w(i), transpose: w(36 + i), quarters: w(72 + i) })),
      count: w(108),
      globalTranspose: w(109),
    }));
  }
  return out;
}

export type FmcFileKind = 'plot' | 'scales' | 'compset' | 'rhythms' | 'tonality';

/** Guess the kind from the name and size. */
export function fmcFileKind(name: string, size: number): FmcFileKind | null {
  const n = name.toUpperCase();
  if (size === 32020 || n.endsWith('.DMP')) return 'plot';
  if (size === 1272 || n.endsWith('.SCA')) return 'scales';
  if (size === 2256) return 'compset';
  if (size === 1840) return 'rhythms';
  if (size === 1760) return 'tonality';
  return null;
}

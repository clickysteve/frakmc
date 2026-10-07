/**
 * The FrakMC document: everything that defines a composition, versioned for persistence.
 * Follows FMC2's model of Main / Rhythm / Tonality set-ups, scale set and plot, plus the 8-slot
 * SAVE/RECALL banks of each screen (the original kept those in COMPSET/RHYTHMS/TONALITY.REC).
 */
import { FULLSET, type Iterations, type PlotSpec, PLOT_H, PLOT_W } from '../fractal/mandelbrot';
import { POWER_ON_STATE } from '../fractal/drand48';

export const DOC_FORMAT = 'frakmc-document';
export const DOC_VERSION = 1;

export const MAX_TRACKS = 6;
export const BOXES = MAX_TRACKS * 2;
export const SLOTS = 8;
export const MAX_TONALITIES = 36;
export const MAX_LENGTHS = 16;
export const SCALE_COUNT = 12;
export const SCALE_ROWS = 8;
export const EDIT_ROWS = 6;
/** Scale-pattern cell codes (as in SCALESET.SCA). */
export const CELL_TIE = 16;
export const CELL_REST = 17;

/** Value ranges (some INFERRED — docs/UNCERTAINTIES.md U5). */
export const LIMITS = {
  chan: [1, 16],
  oct: [1, 8],
  note: [0, 11],
  so: [1, EDIT_ROWS],
  tracks: [1, MAX_TRACKS],
  tempo: [20, 300],
  nReps: [1, 16],
  count: [1, MAX_LENGTHS],
  length: [1, 96],
  tonalities: [1, MAX_TONALITIES],
  scale: [1, SCALE_COUNT],
  transpose: [-24, 24],
  quarters: [1, 99],
  globalTranspose: [-12, 12],
  program: [1, 128],
  cell: [-12, 12],
} as const satisfies Record<string, readonly [number, number]>;

export type SameNote = 'REP' | 'TIE' | 'RST';
export const SAME_NOTE_MODES: readonly SameNote[] = ['REP', 'TIE', 'RST'];
export type FractalType = 'julia' | 'mandelbrot';
export type RhythmType = 'DUR' | 'SEQ';
export const MULTIPLIERS = [4, 8, 16, 32] as const;
export type Multiplier = (typeof MULTIPLIERS)[number];

export interface Track {
  chan: number;
  loOct: number;
  loNote: number;
  hiOct: number;
  hiNote: number;
  so: number;
  sameNote: SameNote;
  disable: boolean;
  mute: boolean;
}

/** Plot-pixel rectangle, inclusive, x1 ≤ x2, y1 ≤ y2. */
export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface MainSetup {
  tracks: Track[];
  numTracks: number;
  fractalType: FractalType;
  ppqn: 96 | 192;
  midiType: 0 | 1;
  tempo: number;
  clock: boolean;
  /** box k: track ⌊k/2⌋, even = notes, odd = durations */
  boxes: (Box | null)[];
  juliaPoints: (Point | null)[];
  /** name of the plot the coordinates were set on */
  plotName: string;
  rhythmSlot: number;
  tonalitySlot: number;
}

export interface RhythmTrack {
  type: RhythmType;
  nReps: number;
  count: number;
  lengths: number[];
}

export interface RhythmMap {
  tracks: RhythmTrack[];
  multiplier: Multiplier;
}

export interface Tonality {
  scale: number;
  transpose: number;
  quarters: number;
}

export interface TonalityMap {
  tonalities: Tonality[];
  count: number;
  globalTranspose: number;
}

export interface ScalePattern {
  name: string;
  /** SCALE_ROWS × 12 offsets; CELL_TIE / CELL_REST codes */
  rows: number[][];
}

export interface FMCDocument {
  format: typeof DOC_FORMAT;
  version: number;
  name: string;
  main: MainSetup;
  rhythm: RhythmMap;
  tonality: TonalityMap;
  scales: ScalePattern[];
  scaleSetName: string;
  plot: PlotSpec;
  banks: {
    main: (MainSetup | null)[];
    rhythm: (RhythmMap | null)[];
    tonality: (TonalityMap | null)[];
  };
  slots: { main: number; rhythm: number; tonality: number };
  patch: { chan: number; program: number };
  options: { juliaFromPlot: boolean; writeTempo: boolean };
  /** drand48 state used by the next Julia composition (12 hex digits) */
  juliaRng: string;
  /** recorded composition as a Standard MIDI File (base64), or null */
  composition: string | null;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const inRange = (v: unknown, [lo, hi]: readonly [number, number], dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), lo, hi) : dflt;

export function defaultTrack(i: number): Track {
  return { chan: i + 1, loOct: 4, loNote: 0, hiOct: 5, hiNote: 0, so: 2, sameNote: 'REP', disable: false, mute: false };
}

export function defaultRhythmTrack(): RhythmTrack {
  return { type: 'DUR', nReps: 1, count: 1, lengths: Array(MAX_LENGTHS).fill(12) };
}

export function chromaticScale(name = 'CHROMATIC'): ScalePattern {
  return { name, rows: Array.from({ length: SCALE_ROWS }, () => Array(12).fill(0)) };
}

export function emptyMain(): MainSetup {
  return {
    tracks: Array.from({ length: MAX_TRACKS }, (_, i) => defaultTrack(i)),
    numTracks: MAX_TRACKS,
    fractalType: 'mandelbrot',
    ppqn: 96,
    midiType: 0,
    tempo: 120,
    clock: false,
    boxes: Array(BOXES).fill(null),
    juliaPoints: Array(MAX_TRACKS).fill(null),
    plotName: FULLSET.name,
    rhythmSlot: 0,
    tonalitySlot: 0,
  };
}

export function emptyRhythm(): RhythmMap {
  return { tracks: Array.from({ length: MAX_TRACKS }, defaultRhythmTrack), multiplier: 8 };
}

export function emptyTonality(): TonalityMap {
  return {
    tonalities: Array.from({ length: MAX_TONALITIES }, () => ({ scale: 1, transpose: 0, quarters: 16 })),
    count: 1,
    globalTranspose: 0,
  };
}

export function blankDocument(): FMCDocument {
  return {
    format: DOC_FORMAT,
    version: DOC_VERSION,
    name: 'UNTITLED',
    main: emptyMain(),
    rhythm: emptyRhythm(),
    tonality: emptyTonality(),
    scales: Array.from({ length: SCALE_COUNT }, () => chromaticScale()),
    scaleSetName: 'SCALESET',
    plot: { ...FULLSET },
    banks: { main: Array(SLOTS).fill(null), rhythm: Array(SLOTS).fill(null), tonality: Array(SLOTS).fill(null) },
    slots: { main: 0, rhythm: 0, tonality: 0 },
    patch: { chan: 1, program: 1 },
    options: { juliaFromPlot: false, writeTempo: true },
    juliaRng: POWER_ON_STATE,
    composition: null,
  };
}

export const clone = <T>(v: T): T => structuredClone(v);

/** Semitone span of a track's range, as the original computes it. */
export function trackRange(t: Track): number {
  return (t.hiOct - t.loOct) * 12 + t.hiNote - t.loNote;
}

// ---------------------------------------------------------------------------------------
// Validation: documents arrive from storage and files, so every field is checked and
// clamped; anything missing falls back to a default. Never throws on bad content.
// ---------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const str = (v: unknown, d: string, max = 64): string => (typeof v === 'string' ? v.slice(0, max) : d);

function normTrack(v: unknown, i: number): Track {
  const d = defaultTrack(i);
  if (!isObj(v)) return d;
  return {
    chan: inRange(v.chan, LIMITS.chan, d.chan),
    loOct: inRange(v.loOct, LIMITS.oct, d.loOct),
    loNote: inRange(v.loNote, LIMITS.note, d.loNote),
    hiOct: inRange(v.hiOct, LIMITS.oct, d.hiOct),
    hiNote: inRange(v.hiNote, LIMITS.note, d.hiNote),
    so: inRange(v.so, LIMITS.so, d.so),
    sameNote: SAME_NOTE_MODES.includes(v.sameNote as SameNote) ? (v.sameNote as SameNote) : 'REP',
    disable: bool(v.disable, false),
    mute: bool(v.mute, false),
  };
}

function normBox(v: unknown): Box | null {
  if (!isObj(v)) return null;
  const n = (k: string, max: number) => inRange(v[k], [0, max - 1], 0);
  const x1 = n('x1', PLOT_W), x2 = n('x2', PLOT_W), y1 = n('y1', PLOT_H), y2 = n('y2', PLOT_H);
  return { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
}

function normPoint(v: unknown): Point | null {
  if (!isObj(v)) return null;
  return { x: inRange(v.x, [0, PLOT_W - 1], 0), y: inRange(v.y, [0, PLOT_H - 1], 0) };
}

export function normMain(v: unknown): MainSetup {
  const d = emptyMain();
  if (!isObj(v)) return d;
  const boxes = arr(v.boxes);
  const pts = arr(v.juliaPoints);
  const tracks = arr(v.tracks);
  return {
    tracks: d.tracks.map((_, i) => normTrack(tracks[i], i)),
    numTracks: inRange(v.numTracks, LIMITS.tracks, d.numTracks),
    fractalType: v.fractalType === 'julia' ? 'julia' : 'mandelbrot',
    ppqn: v.ppqn === 192 ? 192 : 96,
    midiType: v.midiType === 1 ? 1 : 0,
    tempo: inRange(v.tempo, LIMITS.tempo, d.tempo),
    clock: bool(v.clock, false),
    boxes: Array.from({ length: BOXES }, (_, i) => normBox(boxes[i])),
    juliaPoints: Array.from({ length: MAX_TRACKS }, (_, i) => normPoint(pts[i])),
    plotName: str(v.plotName, d.plotName, 32),
    rhythmSlot: inRange(v.rhythmSlot, [0, SLOTS - 1], 0),
    tonalitySlot: inRange(v.tonalitySlot, [0, SLOTS - 1], 0),
  };
}

export function normRhythm(v: unknown): RhythmMap {
  const d = emptyRhythm();
  if (!isObj(v)) return d;
  const tracks = arr(v.tracks);
  return {
    tracks: d.tracks.map((dt, i) => {
      const t = tracks[i];
      if (!isObj(t)) return dt;
      const lens = arr(t.lengths);
      return {
        type: t.type === 'SEQ' ? 'SEQ' : 'DUR',
        nReps: inRange(t.nReps, LIMITS.nReps, 1),
        count: inRange(t.count, LIMITS.count, 1),
        lengths: Array.from({ length: MAX_LENGTHS }, (_, j) => inRange(lens[j], LIMITS.length, 12)),
      };
    }),
    multiplier: (MULTIPLIERS as readonly number[]).includes(v.multiplier as number) ? (v.multiplier as Multiplier) : 8,
  };
}

export function normTonality(v: unknown): TonalityMap {
  const d = emptyTonality();
  if (!isObj(v)) return d;
  const ts = arr(v.tonalities);
  return {
    tonalities: d.tonalities.map((dt, i) => {
      const t = ts[i];
      if (!isObj(t)) return dt;
      return {
        scale: inRange(t.scale, LIMITS.scale, dt.scale),
        transpose: inRange(t.transpose, LIMITS.transpose, 0),
        quarters: inRange(t.quarters, LIMITS.quarters, dt.quarters),
      };
    }),
    count: inRange(v.count, LIMITS.tonalities, 1),
    globalTranspose: inRange(v.globalTranspose, LIMITS.globalTranspose, 0),
  };
}

export function normScale(v: unknown): ScalePattern {
  if (!isObj(v)) return chromaticScale();
  const rows = arr(v.rows);
  return {
    name: str(v.name, 'SCALE', 9).toUpperCase(),
    rows: Array.from({ length: SCALE_ROWS }, (_, r) => {
      const row = arr(rows[r]);
      return Array.from({ length: 12 }, (_, c) => {
        const x = row[c];
        if (x === CELL_TIE || x === CELL_REST) return x;
        return inRange(x, LIMITS.cell, 0);
      });
    }),
  };
}

export function normPlot(v: unknown): PlotSpec {
  if (!isObj(v)) return { ...FULLSET };
  const i32 = (x: unknown, d: number) => (typeof x === 'number' && Number.isInteger(x) ? x | 0 : d);
  const it = v.iterations === 144 || v.iterations === 288 ? (v.iterations as Iterations) : 72;
  const p: PlotSpec = {
    name: str(v.name, 'PLOT', 32).toUpperCase(),
    y0: i32(v.y0, FULLSET.y0),
    dy: i32(v.dy, FULLSET.dy),
    x0: i32(v.x0, FULLSET.x0),
    dx: i32(v.dx, FULLSET.dx),
    iterations: it,
  };
  if (p.dx === 0 || p.dy === 0) return { ...FULLSET };
  return p;
}

export class DocumentError extends Error {}

/** Accept any parsed JSON; return a valid current-version document or throw DocumentError. */
export function normalizeDocument(v: unknown): FMCDocument {
  if (!isObj(v) || v.format !== DOC_FORMAT) throw new DocumentError('Not a FrakMC document');
  if (typeof v.version !== 'number' || v.version > DOC_VERSION) throw new DocumentError('Document is from a newer version of FrakMC');
  // (version 1 is the only version so far; migrations go here)
  const d = blankDocument();
  const banks = isObj(v.banks) ? v.banks : {};
  const slots = isObj(v.slots) ? v.slots : {};
  const patch = isObj(v.patch) ? v.patch : {};
  const options = isObj(v.options) ? v.options : {};
  const scales = arr(v.scales);
  return {
    ...d,
    name: str(v.name, d.name, 40),
    main: normMain(v.main),
    rhythm: normRhythm(v.rhythm),
    tonality: normTonality(v.tonality),
    scales: Array.from({ length: SCALE_COUNT }, (_, i) => normScale(scales[i])),
    scaleSetName: str(v.scaleSetName, d.scaleSetName, 12),
    plot: normPlot(v.plot),
    banks: {
      main: Array.from({ length: SLOTS }, (_, i) => (isObj(arr(banks.main)[i]) ? normMain(arr(banks.main)[i]) : null)),
      rhythm: Array.from({ length: SLOTS }, (_, i) => (isObj(arr(banks.rhythm)[i]) ? normRhythm(arr(banks.rhythm)[i]) : null)),
      tonality: Array.from({ length: SLOTS }, (_, i) => (isObj(arr(banks.tonality)[i]) ? normTonality(arr(banks.tonality)[i]) : null)),
    },
    slots: {
      main: inRange(slots.main, [0, SLOTS - 1], 0),
      rhythm: inRange(slots.rhythm, [0, SLOTS - 1], 0),
      tonality: inRange(slots.tonality, [0, SLOTS - 1], 0),
    },
    patch: { chan: inRange(patch.chan, LIMITS.chan, 1), program: inRange(patch.program, LIMITS.program, 1) },
    options: { juliaFromPlot: bool(options.juliaFromPlot, false), writeTempo: bool(options.writeTempo, true) },
    juliaRng: typeof v.juliaRng === 'string' && /^[0-9a-f]{1,12}$/i.test(v.juliaRng) ? v.juliaRng.toLowerCase().padStart(12, '0') : POWER_ON_STATE,
    composition: typeof v.composition === 'string' && /^[A-Za-z0-9+/=]*$/.test(v.composition) ? v.composition : null,
  };
}

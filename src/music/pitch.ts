/**
 * Index → MIDI note, as FMC2 computes it (docs/BEHAVIOUR.md §5.2–5.3). Pure functions.
 */
import { CELL_REST, CELL_TIE, type FractalType, type ScalePattern, type Track } from '../state/document';

export const TABLE_SIZE = 144;
/** Returned instead of a note: hold the previous note (scale cell T*). */
export const TIE = -1;
/** Returned instead of a note: silence (scale cell R*). */
export const REST = -2;

/**
 * The per-track 144-entry note table: semitones above the low octave's C.
 * Mandelbrot: lo → hi → lo … (triangle). Julia: lo → hi, then hi held.
 */
export function buildNoteTable(track: Track, type: FractalType): Uint8Array {
  const lo = track.loNote;
  const hi = (track.hiOct - track.loOct) * 12 + track.hiNote;
  const t = new Uint8Array(TABLE_SIZE);
  let i = 0;
  let v = lo;
  while (i < TABLE_SIZE) {
    while (i < TABLE_SIZE && v < hi) t[i++] = v++;
    if (type === 'julia') {
      while (i < TABLE_SIZE) t[i++] = v;
      break;
    }
    while (i < TABLE_SIZE && v > lo) t[i++] = v--;
    if (!(lo < hi) && i < TABLE_SIZE) t[i++] = v;
  }
  return t;
}

/**
 * Table lookup with the original's reflection above 143. Indices that end up negative (only
 * with 288 iterations) read the previous track's table end; track 1 reads 0. (U3)
 */
export function lookupTable(tables: Uint8Array[], track: number, index: number): number {
  let i = index;
  if (i > TABLE_SIZE - 1) i = TABLE_SIZE - 1 - (i - (TABLE_SIZE - 1));
  if (i >= 0) return tables[track][i];
  return track > 0 ? tables[track - 1][TABLE_SIZE + i] : 0;
}

export interface PitchContext {
  scales: ScalePattern[];
  /** 1-based scale number of the current tonality */
  scale: number;
  transpose: number;
  globalTranspose: number;
}

/** MIDI note (12–127), TIE or REST for a table value `s` on `track`. */
export function pitchFor(s: number, track: Track, ctx: PitchContext): number {
  let note: number;
  if (track.disable) {
    note = track.loOct * 12 + s;
  } else {
    let p = (track.so - 1) * 12 + s;
    while (p > 95) p -= 12;
    const v = ctx.scales[ctx.scale - 1].rows[Math.floor(p / 12)][p % 12];
    if (v === CELL_TIE) return TIE;
    if (v === CELL_REST) return REST;
    note = s + v + ctx.transpose + ctx.globalTranspose + track.loOct * 12;
  }
  return foldNote(note);
}

/**
 * Fold into 12–127 by octaves. The original compares the 16-bit word *unsigned* against 127,
 * so a negative result (only possible with extreme downward transposition) wraps to the top of
 * the range rather than the bottom; that quirk is kept.
 */
export function foldNote(note: number): number {
  let u = note & 0xffff;
  if (u > 127) u -= 12 * Math.ceil((u - 127) / 12);
  while (u < 12) u += 12;
  return u;
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
export const noteName = (semitone: number): string => NAMES[((semitone % 12) + 12) % 12];

/** "C4"-style name for a MIDI note (track-table octave 5 = MIDI 60 = C4). */
export function midiNoteName(n: number): string {
  return `${noteName(n)}${Math.floor(n / 12) - 1}`;
}

/**
 * What a note-box pixel gives before scales and transposition, in the track table's octave
 * numbering (octave 5 starts at middle C): "TRACK n  NOTE D  OCTAVE 4".
 */
export function examineNoteText(trackNo: number, s: number, track: Track): string {
  const oct = Math.floor(s / 12) + track.loOct;
  return `TRACK ${trackNo}  NOTE ${noteName(s % 12)}  OCTAVE ${oct}`;
}

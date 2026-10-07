/**
 * FrakMC's composition engine, following FMC2's model: a deterministic step generator (docs/BEHAVIOUR.md §5–§9).
 *
 * Each call to `step()` performs one pass of the original's compose loop: every track whose
 * countdown has reached zero gets a new note (pitch from its note box or Julia walker, length
 * from its rhythm, velocity from both), MIDI events are produced for the step's time, then
 * time advances by the smallest remaining countdown and the tonality map moves on.
 *
 * No timers, no DOM, no MIDI I/O: the scheduler pulls steps and decides when they sound.
 */
import { Drand48 } from '../fractal/drand48';
import { type JuliaTrackSetup, juliaC, juliaNoteIndex, juliaVelocity, setupJuliaTrack } from '../fractal/julia';
import { type PlotSpec, colToCr, fmcCount, rowToCi } from '../fractal/mandelbrot';
import {
  type Box, type MainSetup, type RhythmMap, type ScalePattern, type TonalityMap, MAX_TRACKS, trackRange,
} from '../state/document';
import { TIE, buildNoteTable, lookupTable, pitchFor } from './pitch';

export interface ComposeInput {
  main: MainSetup;
  rhythm: RhythmMap;
  tonality: TonalityMap;
  scales: ScalePattern[];
  plot: PlotSpec;
  /** drand48 state for Julia mode (hex); ignored in Mandelbrot mode */
  juliaRng: string;
  juliaFromPlot: boolean;
}

/** A channel message at an absolute tick. `track` is the track (0–5). */
export interface NoteEvent {
  tick: number;
  track: number;
  /** 0x90 | channel */
  status: number;
  note: number;
  /** 0 = note off */
  velocity: number;
}

/** A pixel the composer just recalculated (for the display). */
export interface ScanMark {
  box: number;
  x: number;
  y: number;
  count: number;
}

export interface JuliaDot {
  track: number;
  sx: number;
  sy: number;
}

export interface StepResult {
  tick: number;
  events: NoteEvent[];
  scans: ScanMark[];
  dots: JuliaDot[];
  /** ticks until the next step */
  advance: number;
}

const MUTED = 0x7fff;

class BoxScanner {
  x: number;
  y: number;
  constructor(readonly box: Box) {
    this.x = box.x1;
    this.y = box.y1;
  }
  /** FMC count at the current pixel, then move down; next column; wrap. */
  next(plot: PlotSpec): { x: number; y: number; count: number } {
    const { x, y } = this;
    const count = fmcCount(colToCr(plot, x), rowToCi(plot, y), plot.iterations);
    this.y++;
    if (this.y > this.box.y2) {
      this.y = this.box.y1;
      this.x++;
      if (this.x > this.box.x2) this.x = this.box.x1;
    }
    return { x, y, count };
  }
}

export class MissingCoordinates extends Error {}

export class Composer {
  readonly numTracks: number;
  readonly mandelbrot: boolean;
  /** absolute tick of the next step */
  tick = 0;
  /** tonality state */
  tonalityIndex = 0;
  private quartersLeft: number;
  private tonalityTicks = 0;
  readonly ticksPerQuarter: number;

  private readonly tables: Uint8Array[];
  private readonly scanners: (BoxScanner | null)[] = [];
  private readonly julia: (JuliaTrackSetup | null)[] = [];
  readonly rng: Drand48;

  private readonly remaining = new Array<number>(MAX_TRACKS).fill(0);
  private readonly prevNote = new Array<number>(MAX_TRACKS).fill(0);
  private readonly velPrev = new Array<number>(MAX_TRACKS).fill(64);
  /** SEQ position or DUR repeat counter (the original shares one word per track) */
  private readonly counter = new Array<number>(MAX_TRACKS).fill(0);
  private readonly lastDur = new Array<number>(MAX_TRACKS).fill(0);
  private readonly m1: number;
  private readonly shift: number;
  private readonly mulShift: number;

  constructor(private readonly input: ComposeInput) {
    const { main, plot } = input;
    this.numTracks = main.numTracks;
    this.mandelbrot = main.fractalType === 'mandelbrot';
    this.ticksPerQuarter = main.ppqn;
    this.m1 = plot.iterations - 1;
    this.shift = plot.iterations === 72 ? 0 : plot.iterations === 144 ? 1 : 2;
    this.mulShift = Math.log2(input.rhythm.multiplier);
    this.tables = main.tracks.map((t) => buildNoteTable(t, main.fractalType));
    this.rng = new Drand48(input.juliaRng);
    this.quartersLeft = Math.max(1, input.tonality.tonalities[0].quarters);

    for (let t = 0; t < MAX_TRACKS; t++) {
      const active = t < this.numTracks && !main.tracks[t].mute;
      if (this.mandelbrot) {
        for (const b of [2 * t, 2 * t + 1]) {
          const box = main.boxes[b];
          if (active && !box && (b % 2 === 0 || input.rhythm.tracks[t].type === 'DUR')) {
            throw new MissingCoordinates(`Track ${t + 1} has no ${b % 2 ? 'duration' : 'note'} box`);
          }
          this.scanners[b] = box ? new BoxScanner(box) : null;
        }
      } else {
        const p = main.juliaPoints[t];
        if (active && !p) throw new MissingCoordinates(`Track ${t + 1} has no Julia point`);
        this.julia[t] = active && p
          ? setupJuliaTrack(juliaC(p.x, p.y, plot, input.juliaFromPlot), this.rng, trackRange(main.tracks[t]))
          : null;
      }
    }
  }

  /** Current tonality (for the "SCALE nn TRANS+nn" display). */
  get tonality(): { index: number; scale: number; transpose: number } {
    const t = this.input.tonality.tonalities[this.tonalityIndex];
    return { index: this.tonalityIndex, scale: t.scale, transpose: t.transpose };
  }

  /** Julia walkers' setup (for drawing). */
  juliaSetup(track: number): JuliaTrackSetup | null {
    return this.julia[track] ?? null;
  }

  /** Box scan position (for drawing a cursor). */
  scanPosition(box: number): { x: number; y: number } | null {
    const s = this.scanners[box];
    return s ? { x: s.x, y: s.y } : null;
  }

  step(): StepResult {
    const { main, rhythm } = this.input;
    const events: NoteEvent[] = [];
    const scans: ScanMark[] = [];
    const dots: JuliaDot[] = [];
    const tick = this.tick;

    for (let t = 0; t < this.numTracks; t++) {
      const track = main.tracks[t];
      if (track.mute) this.remaining[t] = MUTED;
      if (this.remaining[t] !== 0) continue;

      // --- pitch part ---
      let index: number;
      let v: number;
      if (this.mandelbrot) {
        const s = this.scanners[2 * t]!.next(this.input.plot);
        scans.push({ box: 2 * t, ...s });
        index = s.count;
        v = ((this.m1 - s.count) >> this.shift) + 40;
      } else {
        const j = this.julia[t]!;
        j.walker.step();
        dots.push({ track: t, sx: j.walker.sx, sy: j.walker.sy });
        index = juliaNoteIndex(j);
        v = juliaVelocity(j.walker.sy);
      }
      const ton = this.input.tonality.tonalities[this.tonalityIndex];
      const note = pitchFor(lookupTable(this.tables, t, index), track, {
        scales: this.input.scales,
        scale: ton.scale,
        transpose: ton.transpose,
        globalTranspose: this.input.tonality.globalTranspose,
      });

      // --- rhythm part ---
      const rt = rhythm.tracks[t];
      let dur: number;
      if (rt.type === 'SEQ' || !this.mandelbrot) {
        if (this.counter[t] === rt.count) {
          this.counter[t] = 0;
          v += 100;
        } else v += 70;
        dur = rt.lengths[this.counter[t]] << this.mulShift;
        this.counter[t]++;
      } else {
        const s = this.scanners[2 * t + 1]!.next(this.input.plot);
        scans.push({ box: 2 * t + 1, ...s });
        if (this.counter[t] === 0) {
          let i = s.count;
          if (i !== 0) i = i % rt.count;
          if (i === 0) this.counter[t] = rt.nReps - 1;
          dur = rt.lengths[i] << this.mulShift;
          this.lastDur[t] = dur;
        } else {
          dur = this.lastDur[t];
          this.counter[t]--;
        }
        v += ((this.m1 - s.count) >> this.shift) + 40;
      }
      v >>= 1;
      v = (v + this.velPrev[t]) >> 1;
      this.velPrev[t] = v;

      // --- events: release, then strike ---
      const status = 0x90 | ((track.chan - 1) & 15);
      const prev = this.prevNote[t];
      if (prev > 0 && note !== TIE && !(note === prev && track.sameNote === 'TIE')) {
        events.push({ tick, track: t, status, note: prev, velocity: 0 });
      }
      if (note > 0 && !(note === prev && track.sameNote !== 'REP')) {
        events.push({ tick, track: t, status, note, velocity: Math.max(1, Math.min(127, v)) });
        this.prevNote[t] = note;
      }
      this.remaining[t] = dur;
    }

    // --- advance time by the smallest countdown ---
    let min = 0;
    for (let t = 0; t < this.numTracks; t++) {
      const r = this.remaining[t];
      if (t === 0 || r < min) min = r;
    }
    for (let t = 0; t < this.numTracks; t++) this.remaining[t] -= min;
    this.tick += min;
    this.advanceTonality(min);
    return { tick, events, scans, dots, advance: min };
  }

  private advanceTonality(ticks: number): void {
    const map = this.input.tonality;
    this.tonalityTicks += ticks;
    while (this.tonalityTicks >= this.ticksPerQuarter) {
      this.tonalityTicks -= this.ticksPerQuarter;
      if (--this.quartersLeft !== 0) continue;
      this.tonalityIndex++;
      if (this.tonalityIndex >= map.count) this.tonalityIndex = 0;
      this.quartersLeft = Math.max(1, map.tonalities[this.tonalityIndex].quarters);
    }
  }

  /** Note-offs for every note still sounding (end of a composition). */
  releaseAll(): NoteEvent[] {
    const out: NoteEvent[] = [];
    for (let t = 0; t < this.numTracks; t++) {
      const p = this.prevNote[t];
      if (p > 0) out.push({ tick: this.tick, track: t, status: 0x90 | ((this.input.main.tracks[t].chan - 1) & 15), note: p, velocity: 0 });
    }
    return out;
  }
}

/**
 * Compose without real time (for tests and "render to MIDI file"): steps until `maxTicks` or
 * `maxEvents`, then releases held notes. Returns the events and the advanced Julia state.
 */
export function composeOffline(input: ComposeInput, maxTicks: number, maxEvents = 200000): { events: NoteEvent[]; endTick: number; juliaRng: string } {
  const c = new Composer(input);
  const events: NoteEvent[] = [];
  let guard = 0;
  while (c.tick < maxTicks && events.length < maxEvents) {
    const r = c.step();
    events.push(...r.events);
    if (r.advance === 0 && ++guard > 10000) break; // all tracks muted
  }
  events.push(...c.releaseAll());
  return { events, endTick: c.tick, juliaRng: c.rng.state };
}

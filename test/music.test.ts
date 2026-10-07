import { describe, expect, it } from 'vitest';
import { FULLSET, pixelCount } from '../src/fractal/mandelbrot';
import { type ComposeInput, Composer, composeOffline, MissingCoordinates } from '../src/music/composer';
import { factoryDocument, factoryScales, setupJulia, snapRow } from '../src/music/factory';
import { REST, TIE, buildNoteTable, foldNote, lookupTable, pitchFor } from '../src/music/pitch';
import {
  type Box, CELL_REST, CELL_TIE, type MainSetup, type Track, chromaticScale, emptyMain, emptyRhythm, emptyTonality,
} from '../src/state/document';

const track = (o: Partial<Track> = {}): Track => ({
  chan: 1, loOct: 5, loNote: 0, hiOct: 5, hiNote: 4, so: 1, sameNote: 'REP', disable: false, mute: false, ...o,
});

describe('note table', () => {
  it('Mandelbrot zig-zags between the limits', () => {
    const t = buildNoteTable(track(), 'mandelbrot');
    expect(Array.from(t.slice(0, 12))).toEqual([0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3]);
  });
  it('Julia rises then holds the top note', () => {
    const t = buildNoteTable(track(), 'julia');
    expect(Array.from(t.slice(0, 8))).toEqual([0, 1, 2, 3, 4, 4, 4, 4]);
    expect(t[143]).toBe(4);
  });
  it('starts at the low note within the low octave', () => {
    const t = buildNoteTable(track({ loNote: 7, hiOct: 6, hiNote: 2 }), 'mandelbrot');
    expect(t[0]).toBe(7);
    expect(Math.max(...t)).toBe(14);
  });
  it('a one-note range repeats the note', () => {
    const t = buildNoteTable(track({ hiNote: 0 }), 'mandelbrot');
    expect(t.every((v) => v === 0)).toBe(true);
  });
  it('reflects indices above 143 and borrows below 0', () => {
    const tables = [buildNoteTable(track(), 'mandelbrot'), buildNoteTable(track({ loNote: 2, hiNote: 9 }), 'mandelbrot')];
    expect(lookupTable(tables, 0, 144)).toBe(tables[0][142]);
    expect(lookupTable(tables, 1, 288)).toBe(tables[0][142]); // 143 − 145 = −2 → previous table
    expect(lookupTable(tables, 0, 288)).toBe(0);
  });
});

describe('pitch', () => {
  const scales = [chromaticScale(), chromaticScale()];
  const ctx = { scales, scale: 1, transpose: 0, globalTranspose: 0 };
  it('octave 5 note 0 is middle C (60)', () => {
    expect(pitchFor(0, track(), ctx)).toBe(60);
  });
  it('applies scale offsets by scale-base octave', () => {
    const sc = chromaticScale();
    sc.rows[0][1] = -1; // C# → C in S.O 1
    sc.rows[1][1] = 1; //  C# → D in S.O 2
    const c = { ...ctx, scales: [sc] };
    expect(pitchFor(1, track({ so: 1 }), c)).toBe(60);
    expect(pitchFor(1, track({ so: 2 }), c)).toBe(62);
    expect(pitchFor(13, track({ so: 1 }), c)).toBe(74); // second octave of the range reads row 2
  });
  it('tie and rest cells', () => {
    const sc = chromaticScale();
    sc.rows[0][3] = CELL_TIE;
    sc.rows[0][4] = CELL_REST;
    const c = { ...ctx, scales: [sc] };
    expect(pitchFor(3, track(), c)).toBe(TIE);
    expect(pitchFor(4, track(), c)).toBe(REST);
  });
  it('transpositions add; D disables scale and transposition', () => {
    const c = { ...ctx, transpose: 5, globalTranspose: -2 };
    expect(pitchFor(0, track(), c)).toBe(63);
    expect(pitchFor(0, track({ disable: true }), c)).toBe(60);
  });
  it('rows above 8 fold back down by octaves', () => {
    expect(pitchFor(95 - 60 + 24, track({ so: 6, loOct: 1 }), ctx)).toBe(12 + 59);
  });
  it('folds into 12–127, negative values wrapping high like the original', () => {
    expect(foldNote(130)).toBe(118);
    expect(foldNote(5)).toBe(17);
    expect(foldNote(-5)).toBe(119);
  });
});

describe('factory scales', () => {
  it('snapRow moves each chromatic note to the nearest allowed pitch', () => {
    const r = snapRow([0, 4, 7]);
    const targets = r.map((o, c) => c + o);
    expect(targets).toEqual([0, 0, 0, 4, 4, 4, 7, 7, 7, 7, 12, 12]); // equal distances snap down
  });
  it('12 named FrakMC patterns; lowest row has fewer pitches than the top', () => {
    const s = factoryScales();
    expect(s.map((x) => x.name)).toEqual(['MAJOR', 'MINOR', 'DOMINANT', 'DIMINISH', 'WHOLETONE', 'PENTATONE',
      'MAJ HOLD', 'MIN HOLD', 'DORIAN', 'LYDIAN', 'SPARSE', 'CHROMATIC']);
    const distinct = (row: number[]) => new Set(row.map((o, c) => (c + o) % 12)).size;
    expect(distinct(s[0].rows[0])).toBeLessThan(distinct(s[0].rows[5]));
    expect(s[6].rows[2]).toContain(CELL_TIE);
    expect(s[10].rows[3]).toContain(CELL_REST);
    expect(s[11].rows.every((r) => r.every((v) => v === 0))).toBe(true);
  });
});

// --- composer --------------------------------------------------------------------------

const IN_SET: Box = { x1: 400, y1: 200, x2: 400, y2: 200 }; // count 0
const CORNER: Box = { x1: 0, y1: 0, x2: 0, y2: 0 }; //       count 72

function input(main: MainSetup, patch: (i: ComposeInput) => void = () => {}): ComposeInput {
  const i: ComposeInput = {
    main, rhythm: emptyRhythm(), tonality: emptyTonality(), scales: factoryScales(), plot: { ...FULLSET },
    juliaRng: '000000000000', juliaFromPlot: false,
  };
  i.tonality.tonalities[0] = { scale: 12, transpose: 0, quarters: 16 };
  patch(i);
  return i;
}

function oneTrack(box: Box, durBox: Box, t: Partial<Track> = {}): MainSetup {
  const m = emptyMain();
  m.numTracks = 1;
  m.tracks[0] = track({ loOct: 4, hiOct: 6, ...t });
  m.boxes[0] = box;
  m.boxes[1] = durBox;
  return m;
}

describe('composer', () => {
  it('the black pool gives the lowest note and the first duration', () => {
    const inp = input(oneTrack(IN_SET, IN_SET), (i) => {
      i.rhythm.tracks[0] = { type: 'DUR', nReps: 1, count: 3, lengths: [3, 12, 24, ...Array(13).fill(12)] };
    });
    const c = new Composer(inp);
    const s = c.step();
    expect(s.events).toEqual([{ tick: 0, track: 0, status: 0x90, note: 48, velocity: expect.any(Number) }]);
    expect(s.advance).toBe(3 * 8);
  });

  it('velocity: loud inside the set, soft far away, smoothed from 64', () => {
    const loud = new Composer(input(oneTrack(IN_SET, IN_SET))).step().events[0].velocity;
    const soft = new Composer(input(oneTrack(CORNER, CORNER))).step().events[0].velocity;
    // inside: ((71−0)+40 + (71−0)+40) >> 1 = 111; (111 + 64) >> 1 = 87
    expect(loud).toBe(87);
    // far: ((71−72)+40)·2 >> 1 = 39; (39 + 64) >> 1 = 51
    expect(soft).toBe(51);
  });

  it('scans the box down each column, then the next column, then wraps', () => {
    const box: Box = { x1: 10, y1: 20, x2: 11, y2: 21 };
    const c = new Composer(input(oneTrack(box, IN_SET)));
    const pos = Array.from({ length: 5 }, () => c.step().scans.find((s) => s.box === 0)!).map((s) => [s.x, s.y]);
    expect(pos).toEqual([[10, 20], [10, 21], [11, 20], [11, 21], [10, 20]]);
  });

  it('note index = FMC count of the scanned pixel through the zig-zag table', () => {
    const px = { x: 545, y: 200 };
    const count = pixelCount(FULLSET, px.x, px.y);
    const m = oneTrack({ x1: px.x, y1: px.y, x2: px.x, y2: px.y }, IN_SET, { loOct: 4, loNote: 0, hiOct: 5, hiNote: 0 });
    const ev = new Composer(input(m)).step().events[0];
    const tri = count % 24 <= 12 ? count % 24 : 24 - (count % 24);
    expect(ev.note).toBe(48 + tri);
  });

  it('REP re-strikes, TIE holds, RST leaves a gap for repeated notes', () => {
    const run = (mode: 'REP' | 'TIE' | 'RST') => {
      const c = new Composer(input(oneTrack(IN_SET, IN_SET, { sameNote: mode })));
      return [c.step(), c.step(), c.step()].map((s) => s.events.map((e) => (e.velocity ? `on${e.note}` : `off${e.note}`)).join(','));
    };
    expect(run('REP')).toEqual(['on48', 'off48,on48', 'off48,on48']);
    expect(run('TIE')).toEqual(['on48', '', '']);
    expect(run('RST')).toEqual(['on48', 'off48', 'off48']);
  });

  it('DUR: the first ("REP") length starts a run of N.REPS notes', () => {
    const inp = input(oneTrack(IN_SET, IN_SET), (i) => {
      i.rhythm.tracks[0] = { type: 'DUR', nReps: 3, count: 2, lengths: [6, 12, ...Array(14).fill(12)] };
    });
    const c = new Composer(inp);
    expect([1, 2, 3, 4].map(() => c.step().advance)).toEqual([48, 48, 48, 48]);
    // corner pixel: count 72, 72 mod 2 = 0 → also the REP length
    const inp2 = input(oneTrack(IN_SET, { x1: 545, y1: 200, x2: 545, y2: 200 }), (i) => {
      i.rhythm.tracks[0] = { type: 'DUR', nReps: 1, count: 5, lengths: [1, 2, 3, 4, 5, ...Array(11).fill(12)] };
    });
    const k = pixelCount(FULLSET, 545, 200) % 5;
    expect(new Composer(inp2).step().advance).toBe([1, 2, 3, 4, 5][k] * 8);
  });

  it('SEQ: lengths in order; +100 accent when the sequence restarts', () => {
    const inp = input(oneTrack(IN_SET, IN_SET), (i) => {
      i.rhythm.tracks[0] = { type: 'SEQ', nReps: 1, count: 3, lengths: [1, 2, 3, ...Array(13).fill(12)] };
      i.rhythm.multiplier = 4;
    });
    const c = new Composer(inp);
    const steps = Array.from({ length: 7 }, () => c.step());
    expect(steps.map((s) => s.advance)).toEqual([4, 8, 12, 4, 8, 12, 4]);
    const v = steps.map((s) => s.events.find((e) => e.velocity)!.velocity);
    expect(v[3]).toBeGreaterThan(v[2]); // restart accent
  });

  it('tracks advance independently by the smallest countdown', () => {
    const m = oneTrack(IN_SET, IN_SET);
    m.numTracks = 2;
    m.tracks[1] = track({ chan: 2, loOct: 3, hiOct: 4 });
    m.boxes[2] = IN_SET;
    m.boxes[3] = IN_SET;
    const inp = input(m, (i) => {
      i.rhythm.tracks[0] = { type: 'SEQ', nReps: 1, count: 1, lengths: Array(16).fill(12) };
      i.rhythm.tracks[1] = { type: 'SEQ', nReps: 1, count: 1, lengths: Array(16).fill(6) };
    });
    const c = new Composer(inp);
    const ticks = Array.from({ length: 4 }, () => {
      const s = c.step();
      return [s.tick, s.events.filter((e) => e.velocity).map((e) => e.track).join('')];
    });
    expect(ticks).toEqual([[0, '01'], [48, '1'], [96, '01'], [144, '1']]);
  });

  it('muted tracks are not composed', () => {
    const m = oneTrack(IN_SET, IN_SET, { mute: true });
    const r = composeOffline(input(m), 1000);
    expect(r.events).toEqual([]);
  });

  it('the tonality map cycles in quarter notes', () => {
    const inp = input(oneTrack(IN_SET, IN_SET), (i) => {
      i.rhythm.tracks[0] = { type: 'SEQ', nReps: 1, count: 1, lengths: Array(16).fill(12) }; // 1 quarter
      i.tonality.tonalities[0] = { scale: 12, transpose: 0, quarters: 2 };
      i.tonality.tonalities[1] = { scale: 12, transpose: 7, quarters: 1 };
      i.tonality.count = 2;
    });
    const c = new Composer(inp);
    const notes = Array.from({ length: 7 }, () => c.step().events.find((e) => e.velocity)!.note);
    expect(notes).toEqual([48, 48, 55, 48, 48, 55, 48]);
  });

  it('192 PPQN keeps tick lengths but counts tonality quarters in 192 ticks', () => {
    const m = oneTrack(IN_SET, IN_SET);
    m.ppqn = 192;
    const inp = input(m, (i) => {
      i.rhythm.tracks[0] = { type: 'SEQ', nReps: 1, count: 1, lengths: Array(16).fill(12) };
      i.tonality.tonalities[0] = { scale: 12, transpose: 0, quarters: 1 };
      i.tonality.tonalities[1] = { scale: 12, transpose: 7, quarters: 1 };
      i.tonality.count = 2;
    });
    const c = new Composer(inp);
    const notes = Array.from({ length: 4 }, () => c.step().events.find((e) => e.velocity)!.note);
    expect(notes).toEqual([48, 48, 55, 55]);
  });

  it('requires coordinates', () => {
    expect(() => new Composer(input(oneTrack(null as never, IN_SET)))).toThrow(MissingCoordinates);
  });

  it('is deterministic: the factory set-up composes identically twice', () => {
    const d = factoryDocument();
    const mk = (): ComposeInput => ({ main: d.main, rhythm: d.rhythm, tonality: d.tonality, scales: d.scales, plot: d.plot, juliaRng: d.juliaRng, juliaFromPlot: false });
    const a = composeOffline(mk(), 96 * 64);
    const b = composeOffline(mk(), 96 * 64);
    expect(a.events.length).toBeGreaterThan(100);
    expect(a.events).toEqual(b.events);
    // every note-on is eventually released
    const sounding = new Set<string>();
    for (const e of a.events) {
      const k = `${e.status}:${e.note}`;
      if (e.velocity) sounding.add(k);
      else sounding.delete(k);
    }
    expect(sounding.size).toBe(0);
  });

  it('Julia: deterministic for a given generator state; state advances', () => {
    const d = factoryDocument();
    const main = setupJulia();
    const mk = (rng: string): ComposeInput => ({ main, rhythm: d.banks.rhythm[4]!, tonality: d.banks.tonality[4]!, scales: d.scales, plot: d.plot, juliaRng: rng, juliaFromPlot: false });
    const a = composeOffline(mk('000000000000'), 96 * 32);
    const b = composeOffline(mk('000000000000'), 96 * 32);
    expect(a.events).toEqual(b.events);
    expect(a.juliaRng).not.toBe('000000000000');
    const c = composeOffline(mk(a.juliaRng), 96 * 32);
    expect(c.events).not.toEqual(a.events);
    for (const e of a.events) {
      expect(e.note).toBeGreaterThanOrEqual(12);
      expect(e.velocity).toBeLessThanOrEqual(127);
    }
  });
});

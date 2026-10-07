import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeOffline } from '../src/music/composer';
import { factoryDocument } from '../src/music/factory';
import { bytesToSequence, noteEventsToSequence, sequenceToBytes } from '../src/music/recording';
import { readSmf, SmfError, toFormat0, toFormat1, writeSmf, fromBase64, toBase64 } from '../src/midi/smf';
import {
  decodeCompset, decodeRhythms, decodeScaleSet, decodeTonalities, encodeScaleSet, FmcFileError,
} from '../src/persistence/fmcFiles';
import { DocStore, MemoryKV, documentFromJson, documentToJson } from '../src/persistence/storage';
import { DocumentError, normalizeDocument } from '../src/state/document';

function composed() {
  const d = factoryDocument();
  const r = composeOffline({ main: d.main, rhythm: d.rhythm, tonality: d.tonality, scales: d.scales, plot: d.plot, juliaRng: d.juliaRng, juliaFromPlot: false }, 96 * 32);
  return noteEventsToSequence(r.events, 96, 100, r.endTick);
}

describe('standard MIDI files', () => {
  it('format 0 round trip keeps every note at its tick', () => {
    const seq = composed();
    const back = bytesToSequence(sequenceToBytes(seq, 0, 'test', true));
    expect(back.ppqn).toBe(96);
    expect(back.tempo).toBe(100);
    expect(back.events.map((e) => [e.tick, ...e.bytes])).toEqual(seq.events.map((e) => [e.tick, ...e.bytes]));
  });

  it('format 1 writes one track per composer track, starting with a text event', () => {
    const seq = composed();
    const smf = readSmf(sequenceToBytes(seq, 1, 'fractal1', false));
    const tracks = new Set(seq.events.map((e) => e.track)).size;
    expect(smf.format).toBe(1);
    expect(smf.tracks.length).toBe(tracks);
    expect(smf.tracks[0].events[0].bytes.slice(0, 2)).toEqual([0xff, 0x01]);
    expect(String.fromCharCode(...smf.tracks[0].events[0].bytes.slice(2))).toBe('FRACTAL1');
    expect(smf.tracks.flatMap((t) => t.events).some((e) => e.bytes[0] === 0xff && e.bytes[1] === 0x51)).toBe(false);
  });

  it('header bytes are standard', () => {
    const b = sequenceToBytes(composed(), 0, 'x', true);
    expect(Array.from(b.slice(0, 14))).toEqual([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96]);
  });

  it('reads running status and converts between types', () => {
    const bytes = Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 15,
      0, 0x90, 60, 100, 0, 61, 100, 10, 0x91, 40, 90, 0, 0xff, 0x2f, 0,
    ]);
    const smf = readSmf(bytes);
    expect(smf.tracks[0].events.slice(0, 3).map((e) => e.bytes)).toEqual([[0x90, 60, 100], [0x90, 61, 100], [0x91, 40, 90]]);
    const t1 = toFormat1(smf);
    expect(t1.tracks.length).toBe(3); // meta + channel 1 + channel 2
    const t0 = toFormat0(t1);
    expect(t0.tracks[0].events.filter((e) => e.bytes[0] < 0xf0).length).toBe(3);
    expect(readSmf(writeSmf(t0)).tracks[0].events.length).toBe(4);
  });

  it('rejects junk', () => {
    expect(() => readSmf(Uint8Array.from([1, 2, 3, 4, 5]))).toThrow(SmfError);
    expect(() => readSmf(Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 9, 0, 0x90]))).toThrow(SmfError);
  });

  it('base64 round trip', () => {
    const b = sequenceToBytes(composed(), 1, 'x', true);
    expect(fromBase64(toBase64(b))).toEqual(b);
  });
});

describe('documents', () => {
  it('JSON round trip preserves the document', () => {
    const d = factoryDocument();
    d.composition = toBase64(sequenceToBytes(composed(), 0, 'x', true));
    expect(documentFromJson(documentToJson(d))).toEqual(d);
  });

  it('a saved document recomposes identically after reload', () => {
    const d = factoryDocument();
    const again = documentFromJson(documentToJson(d));
    const run = (x: typeof d) => composeOffline({ main: x.main, rhythm: x.rhythm, tonality: x.tonality, scales: x.scales, plot: x.plot, juliaRng: x.juliaRng, juliaFromPlot: x.options.juliaFromPlot }, 4000).events;
    expect(run(again)).toEqual(run(d));
  });

  it('clamps and repairs bad values instead of failing', () => {
    const d = JSON.parse(documentToJson(factoryDocument()));
    d.main.tracks[0].chan = 99;
    d.main.tempo = 'fast';
    d.main.boxes[0] = { x1: 700, y1: -4, x2: 3, y2: 9 };
    d.rhythm.tracks[1].lengths = null;
    d.scales[0].rows[0][0] = 300;
    const n = normalizeDocument(d);
    expect(n.main.tracks[0].chan).toBe(16);
    expect(n.main.tempo).toBe(120);
    expect(n.main.boxes[0]).toEqual({ x1: 3, y1: 0, x2: 639, y2: 9 });
    expect(n.rhythm.tracks[1].lengths).toHaveLength(16);
    expect(n.scales[0].rows[0][0]).toBe(12);
  });

  it('refuses non-documents and newer versions', () => {
    expect(() => documentFromJson('nope')).toThrow(DocumentError);
    expect(() => normalizeDocument({ format: 'other' })).toThrow(DocumentError);
    expect(() => normalizeDocument({ format: 'frakmc-document', version: 99 })).toThrow(DocumentError);
  });

  it('browser store: autosave, named saves, list, remove, prefs', () => {
    const s = new DocStore(new MemoryKV());
    const d = factoryDocument();
    s.saveCurrent(d);
    expect(s.loadCurrent()).toEqual(d);
    d.name = 'SONG';
    s.save(d);
    expect(s.list().map((x) => x.name)).toEqual(['SONG']);
    expect(s.load('SONG').name).toBe('SONG');
    s.remove('SONG');
    expect(s.list()).toEqual([]);
    s.savePrefs({ a: 1 });
    expect(s.loadPrefs({ a: 0, b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('works without storage', () => {
    const s = new DocStore(null);
    expect(s.loadCurrent()).toBeNull();
    s.saveCurrent(factoryDocument());
    expect(s.list()).toEqual([]);
  });
});

describe('original FMC2 files', () => {
  it('scale set round trip in the original format', () => {
    const scales = factoryDocument().scales;
    const back = decodeScaleSet(encodeScaleSet(scales));
    expect(back.map((s) => s.rows)).toEqual(scales.map((s) => s.rows));
    expect(back[0].name).toBe('MAJOR');
  });

  it('rejects wrong sizes', () => {
    expect(() => decodeScaleSet(new Uint8Array(10))).toThrow(FmcFileError);
    expect(() => decodeCompset(new Uint8Array(10))).toThrow(FmcFileError);
  });

  it('decodes a synthetic COMPSET record', () => {
    const b = new Uint8Array(2256);
    const w = (i: number, v: number) => {
      b[i * 2] = (v >> 8) & 255;
      b[i * 2 + 1] = v & 255;
    };
    [3, 5, 0, 6, 7, 2, 1, 0, 1].forEach((v, i) => w(i, v));
    [10, 20, 30, 40].forEach((v, i) => w(54 + i, v));
    w(126, 4);
    w(127, 1);
    w(128, 1);
    w(130, 96);
    'HIPLOT02.DMP'.split('').forEach((c, i) => (b[266 + i] = c.charCodeAt(0)));
    const [s] = decodeCompset(b);
    expect(s!.tracks[0]).toEqual({ chan: 3, loOct: 5, loNote: 0, hiOct: 6, hiNote: 7, so: 2, sameNote: 'TIE', disable: false, mute: true });
    expect(s!.boxes[0]).toEqual({ x1: 10, y1: 20, x2: 30, y2: 40 });
    expect(s!.numTracks).toBe(4);
    expect(s!.ppqn).toBe(192);
    expect(s!.tempo).toBe(96);
    expect(s!.plotName).toBe('HIPLOT02');
  });

  const R = 'research-sources/fmc2/';
  it.skipIf(!existsSync(R + 'RHYTHMS.REC'))('reads the original records as the tutorial describes them', () => {
    const rh = decodeRhythms(new Uint8Array(readFileSync(R + 'RHYTHMS.REC')));
    // slot 1, track 4 (bass): three quarter notes in a row or a dotted minim
    expect(rh[0]!.tracks[3]).toMatchObject({ type: 'DUR', nReps: 3, count: 2 });
    expect(rh[0]!.tracks[3].lengths.slice(0, 2)).toEqual([12, 36]);
    const ton = decodeTonalities(new Uint8Array(readFileSync(R + 'TONALITY.REC')));
    expect(ton[0]!.tonalities.slice(0, 7).every((t) => t.quarters === 6)).toBe(true);
    const cs = decodeCompset(new Uint8Array(readFileSync(R + 'COMPSET.REC')));
    expect(cs[0]!.plotName).toBe('HIPLOT01');
    expect(cs[4]!.fractalType).toBe('julia');
    const sc = decodeScaleSet(new Uint8Array(readFileSync(R + 'SCALESET.SCA')));
    expect(sc[5].name).toBe('CHROMATIC');
  });
});

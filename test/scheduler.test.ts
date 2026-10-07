import { describe, expect, it } from 'vitest';
import { Router, type MidiSink } from '../src/midi/router';
import { Monitor } from '../src/midi/monitor';
import { Composer, type ComposeInput } from '../src/music/composer';
import { factoryDocument } from '../src/music/factory';
import { noteEventsToSequence } from '../src/music/recording';
import { Scheduler, type Timer } from '../src/scheduler/scheduler';
import { ComposeSource, SequenceSource } from '../src/scheduler/sources';

class FakeTimer implements Timer {
  cb: (() => void) | null = null;
  start(cb: () => void) {
    this.cb = cb;
  }
  stop() {
    this.cb = null;
  }
}

function rig() {
  let t = 1000;
  const now = () => t;
  const sent: { bytes: number[]; at: number }[] = [];
  const device: MidiSink = { send: (bytes, at) => sent.push({ bytes, at: at ?? t }) };
  const router = new Router(now);
  router.setDevice(device);
  const timer = new FakeTimer();
  const sch = new Scheduler(router, timer, now);
  sch.startDelayMs = 0;
  const advance = (ms: number, step = 10) => {
    for (let i = 0; i < ms; i += step) {
      t += step;
      timer.cb?.();
    }
  };
  return { now, sent, router, timer, sch, advance, set: (v: number) => (t = v) };
}

const seq = (events: [number, number[]][], endTick: number, ppqn = 96) =>
  noteEventsToSequence(events.map(([tick, b]) => ({ tick, track: 0, status: b[0], note: b[1], velocity: b[2] })), ppqn, 120, endTick);

describe('scheduler', () => {
  it('timestamps events from ticks, tempo and PPQN', () => {
    const r = rig();
    r.sch.start(new SequenceSource(seq([[0, [0x90, 60, 100]], [96, [0x90, 60, 0]], [192, [0x90, 62, 90]]], 288)), { ppqn: 96, tempo: 120, clock: false });
    r.advance(2000);
    const ats = r.sent.filter((s) => s.bytes[0] === 0x90).map((s) => s.at - 1000);
    expect(ats).toEqual([0, 500, 1000]); // 120 bpm: a quarter is 500 ms
  });

  it('192 PPQN plays the same ticks twice as fast', () => {
    const r = rig();
    r.sch.start(new SequenceSource(seq([[0, [0x90, 60, 100]], [96, [0x90, 60, 0]]], 96)), { ppqn: 192, tempo: 120, clock: false });
    r.advance(1000);
    expect(r.sent.filter((s) => s.bytes[0] === 0x90).map((s) => s.at - 1000)).toEqual([0, 250]);
  });

  it('only schedules within the look-ahead window', () => {
    const r = rig();
    r.sch.start(new SequenceSource(seq([[0, [0x90, 60, 100]], [960, [0x90, 60, 0]]], 960)), { ppqn: 96, tempo: 120, clock: false });
    r.advance(100);
    expect(r.sent.length).toBe(1);
    r.advance(4790); // tick 960 is due at 5000 ms
    expect(r.sent.length).toBe(1);
    r.advance(20);
    expect(r.sent.length).toBe(2);
  });

  it('stop releases notes that are sounding or queued, after their note-on', () => {
    const r = rig();
    r.sch.start(new SequenceSource(seq([[0, [0x90, 60, 100]], [10, [0x90, 64, 100]], [9600, [0x90, 60, 0]]], 9600)), { ppqn: 96, tempo: 120, clock: false });
    r.advance(20);
    r.sch.stop();
    const offs = r.sent.filter((s) => s.bytes[0] === 0x80 || (s.bytes[0] === 0x90 && s.bytes[2] === 0));
    expect(offs.map((o) => o.bytes[1]).sort()).toEqual([60, 64]);
    const on64 = r.sent.find((s) => s.bytes[1] === 64 && s.bytes[2] > 0)!;
    const off64 = offs.find((o) => o.bytes[1] === 64)!;
    expect(off64.at).toBeGreaterThan(on64.at);
    expect(r.router.soundingCount).toBe(0);
  });

  it('live tempo change re-anchors from the current position', () => {
    const r = rig();
    r.sch.start(new SequenceSource(seq([[0, [0x90, 60, 100]], [96, [0x90, 61, 100]], [192, [0x90, 62, 100]]], 300)), { ppqn: 96, tempo: 120, clock: false });
    r.advance(250); // half way to tick 96 (only tick 0 scheduled… plus look-ahead)
    r.sch.setTempo(60);
    r.advance(3000);
    const at = r.sent.filter((s) => s.bytes[2] > 0).map((s) => s.at - 1000);
    expect(at[0]).toBe(0);
    expect(at[2] - at[1]).toBe(1000); // 60 bpm after the change
  });

  it('MIDI clock: start, 24 pulses per quarter, stop', () => {
    const r = rig();
    r.sch.start(new SequenceSource(seq([[0, [0x90, 60, 100]], [96, [0x90, 60, 0]]], 96)), { ppqn: 96, tempo: 120, clock: true });
    r.advance(1000);
    const kinds = r.sent.map((s) => s.bytes[0]);
    expect(kinds[0]).toBe(0xfa);
    const pulses = r.sent.filter((s) => s.bytes[0] === 0xf8);
    expect(pulses.length).toBeGreaterThanOrEqual(24);
    expect(pulses[1].at - pulses[0].at).toBeCloseTo(500 / 24, 6);
    expect(kinds).toContain(0xfc);
  });

  it('ends by itself at the end of a sequence', () => {
    const r = rig();
    let reason = '';
    r.sch.onStop = (x) => (reason = x);
    r.sch.start(new SequenceSource(seq([[0, [0x90, 60, 100]], [48, [0x90, 60, 0]]], 48)), { ppqn: 96, tempo: 120, clock: false });
    r.advance(1000);
    expect(r.sch.playing).toBe(false);
    expect(reason).toBe('ended');
  });

  it('keeps time when the main thread stalls for less than the look-ahead', () => {
    const r = rig();
    const d = factoryDocument();
    const inp: ComposeInput = { main: d.main, rhythm: d.rhythm, tonality: d.tonality, scales: d.scales, plot: d.plot, juliaRng: d.juliaRng, juliaFromPlot: false };
    r.sch.start(new ComposeSource(new Composer(inp)), { ppqn: 96, tempo: 140, clock: false });
    for (let i = 0; i < 200; i++) r.advance(i % 10 === 0 ? 80 : 10, i % 10 === 0 ? 80 : 10); // 80 ms stalls
    expect(r.sch.maxLateMs).toBeLessThanOrEqual(0);
    r.sch.stop();
    expect(r.router.soundingCount).toBe(0);
  });
});

describe('router and monitor', () => {
  it('switching device releases notes on the old device', () => {
    let t = 0;
    const a: number[][] = [], b: number[][] = [];
    const router = new Router(() => t);
    router.setDevice({ send: (x) => a.push(x) });
    router.send([0x91, 60, 100]);
    router.setDevice({ send: (x) => b.push(x) });
    expect(a.at(-1)).toEqual([0x81, 60, 0]);
    expect(b).toEqual([]);
  });

  it('panic resets every channel and sweeps used ones', () => {
    const got: number[][] = [];
    const router = new Router(() => 0);
    router.setDevice({ send: (x) => got.push(x) });
    router.send([0x92, 40, 100]);
    router.panic();
    expect(got.filter((x) => x[0] >= 0xb0 && x[0] < 0xc0 && x[1] === 123).length).toBe(16);
    expect(got.filter((x) => x[0] === 0x82).length).toBeGreaterThanOrEqual(128);
    expect(router.soundingCount).toBe(0);
  });

  it('monitor shows messages when they are due', () => {
    let t = 0;
    const m = new Monitor(() => t);
    m.send([0x90, 60, 100], 50);
    m.update();
    expect(m.active[0].size).toBe(0);
    t = 60;
    m.update();
    expect(m.active[0].get(60)).toBe(100);
  });
});

describe('compose recording', () => {
  it('trims events queued after the stop point and closes held notes', () => {
    const d = factoryDocument();
    const src = new ComposeSource(new Composer({ main: d.main, rhythm: d.rhythm, tonality: d.tonality, scales: d.scales, plot: d.plot, juliaRng: d.juliaRng, juliaFromPlot: false }));
    src.fill(2000, []);
    src.finish(1000);
    expect(src.recorded.every((e) => e.tick <= 1000)).toBe(true);
    const on = new Set<string>();
    for (const e of src.recorded) {
      const k = `${e.status}:${e.note}`;
      if (e.velocity) on.add(k);
      else on.delete(k);
    }
    expect(on.size).toBe(0);
    expect(src.endTick).toBe(1000);
  });
});

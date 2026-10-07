import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from '../src/midi/router';
import { WebMidi } from '../src/midi/webmidi';

class FakeOutput {
  state: 'connected' | 'disconnected' = 'connected';
  sent: { bytes: number[]; at?: number }[] = [];
  constructor(readonly id: string, readonly name: string) {}
  manufacturer = 'Test';
  send(bytes: number[], at?: number) {
    if (this.state !== 'connected') throw new Error('InvalidStateError');
    this.sent.push({ bytes, at });
  }
}

function fakeAccess() {
  const outputs = new Map<string, FakeOutput>();
  const access = { outputs, onstatechange: null as null | (() => void) };
  return { access, outputs, plug(o: FakeOutput) { outputs.set(o.id, o); access.onstatechange?.(); }, unplug(id: string) { outputs.get(id)!.state = 'disconnected'; access.onstatechange?.(); } };
}

afterEach(() => vi.unstubAllGlobals());

describe('Web MIDI', () => {
  it('reports unsupported without requestMIDIAccess', async () => {
    vi.stubGlobal('navigator', {});
    const m = new WebMidi();
    await m.init();
    expect(m.status).toBe('unsupported');
  });

  it('reports a refused permission', async () => {
    vi.stubGlobal('navigator', { requestMIDIAccess: () => Promise.reject(new Error('denied')) });
    const m = new WebMidi();
    await m.init();
    expect(m.status).toBe('denied');
  });

  it('lists outputs, follows hot-plug, and survives a device vanishing', async () => {
    const f = fakeAccess();
    f.outputs.set('a', new FakeOutput('a', 'Synth A'));
    vi.stubGlobal('navigator', { requestMIDIAccess: () => Promise.resolve(f.access) });
    const m = new WebMidi();
    let changes = 0;
    m.onChange(() => changes++);
    await m.init();
    expect(m.status).toBe('ready');
    expect(m.outputs().map((o) => o.name)).toEqual(['Synth A']);
    f.plug(new FakeOutput('b', 'Synth B'));
    expect(m.outputs().map((o) => o.name)).toEqual(['Synth A', 'Synth B']);
    expect(changes).toBeGreaterThanOrEqual(2);

    // route through the Router: notes are tracked, and released on device change
    const router = new Router(() => 0);
    router.setDevice(m.sink('a'));
    router.send([0x90, 60, 100], 5);
    router.setDevice(m.sink('b'));
    const a = f.outputs.get('a')!.sent;
    expect(a.at(-1)!.bytes).toEqual([0x80, 60, 0]);
    expect(a.at(-1)!.at).toBeGreaterThan(5);

    // B disappears mid-performance: sends must not throw, and the sink is no longer offered
    router.send([0x91, 50, 90]);
    f.unplug('b');
    expect(() => router.send([0x91, 52, 90])).not.toThrow();
    expect(m.sink('b')).toBeNull();
    expect(m.outputs().find((o) => o.id === 'b')!.connected).toBe(false);
  });
});

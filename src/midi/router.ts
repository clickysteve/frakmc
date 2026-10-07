/**
 * MIDI routing and note safety.
 *
 * Everything FrakMC sends goes through the Router, which forwards to the chosen output device
 * and to the internal monitor, and remembers which notes have been switched on (including notes
 * scheduled a little in the future). Stop, device changes and document changes call
 * `releaseAll`, which sends a note-off for every note still on — timed after its note-on, so a
 * note already queued for the near future cannot be left hanging. Panic adds All Sound Off /
 * All Notes Off / sustain-off on every channel and a note-off sweep on the channels in use.
 */

export interface MidiSink {
  /** timestamp in performance.now() milliseconds; omitted or ≤ now = immediately */
  send(bytes: number[], timestamp?: number): void;
}

interface NoteState {
  on: boolean;
  /** time of the last on/off message for this key */
  at: number;
}

export class Router implements MidiSink {
  private device: MidiSink | null = null;
  private readonly listeners = new Set<MidiSink>();
  private readonly notes = new Map<number, NoteState>();
  /** channels that have carried notes since the last panic (for the sweep) */
  private readonly usedChannels = new Set<number>();
  /** messages sent (diagnostics) */
  sent = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Switch output device, releasing notes on the old one first. */
  setDevice(sink: MidiSink | null): void {
    if (sink === this.device) return;
    this.releaseAll();
    this.device = sink;
  }

  get hasDevice(): boolean {
    return this.device !== null;
  }

  /** Extra receivers (the internal monitor). */
  addListener(l: MidiSink): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  send(bytes: number[], timestamp?: number): void {
    const st = bytes[0] & 0xf0;
    if ((st === 0x90 || st === 0x80) && bytes.length >= 3) {
      const key = ((bytes[0] & 15) << 7) | bytes[1];
      const on = st === 0x90 && bytes[2] > 0;
      this.notes.set(key, { on, at: timestamp ?? this.now() });
      if (on) this.usedChannels.add(bytes[0] & 15);
    }
    this.sent++;
    this.device?.send(bytes, timestamp);
    for (const l of this.listeners) l.send(bytes, timestamp);
  }

  /** Notes currently switched on (or queued on). */
  get soundingCount(): number {
    let n = 0;
    for (const s of this.notes.values()) if (s.on) n++;
    return n;
  }

  /** Note-off for every note left on, each no earlier than 1 ms after its note-on. */
  releaseAll(): number {
    const now = this.now();
    let n = 0;
    for (const [key, s] of this.notes) {
      if (!s.on) continue;
      const at = Math.max(now, s.at + 1);
      this.send([0x80 | (key >> 7), key & 127, 0], at);
      n++;
    }
    this.notes.clear();
    return n;
  }

  /** Panic: release tracked notes, then reset every channel; sweep note-offs on used channels. */
  panic(extraChannels: number[] = []): void {
    this.releaseAll();
    const at = this.now();
    for (let ch = 0; ch < 16; ch++) {
      this.send([0xb0 | ch, 64, 0], at); //  sustain off
      this.send([0xb0 | ch, 120, 0], at); // all sound off
      this.send([0xb0 | ch, 123, 0], at); // all notes off
    }
    const sweep = new Set([...this.usedChannels, ...extraChannels]);
    for (const ch of sweep) for (let n = 0; n < 128; n++) this.send([0x80 | ch, n, 0], at);
    this.usedChannels.clear();
    this.notes.clear();
  }
}

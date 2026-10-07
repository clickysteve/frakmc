/**
 * The internal MIDI monitor: a receiver that keeps the recent outgoing messages so the UI can
 * show them as they *sound* (messages may be queued up to ~0.1 s ahead). Makes FrakMC testable
 * without hardware. No audio.
 */
import type { MidiSink } from './router';

export interface MonitorEntry {
  at: number;
  bytes: number[];
}

export class Monitor implements MidiSink {
  private queue: MonitorEntry[] = [];
  /** delivered messages, newest last (bounded) */
  readonly log: MonitorEntry[] = [];
  /** sounding notes per channel: key = note, value = velocity */
  readonly active: Map<number, number>[] = Array.from({ length: 16 }, () => new Map());
  /** per-channel time of the last note-on, for activity lamps */
  readonly lastOn = new Array<number>(16).fill(-1e9);
  total = 0;

  constructor(private readonly now: () => number = () => performance.now(), private readonly maxLog = 400) {}

  send(bytes: number[], timestamp?: number): void {
    const at = timestamp ?? this.now();
    this.queue.push({ at, bytes: [...bytes] });
  }

  /** Apply everything due by now; returns what was delivered. */
  update(): MonitorEntry[] {
    const now = this.now();
    if (!this.queue.length) return [];
    this.queue.sort((a, b) => a.at - b.at);
    let i = 0;
    while (i < this.queue.length && this.queue[i].at <= now) this.apply(this.queue[i++]);
    return this.queue.splice(0, i);
  }

  private apply(e: MonitorEntry): void {
    this.total++;
    this.log.push(e);
    if (this.log.length > this.maxLog) this.log.splice(0, this.log.length - this.maxLog);
    const [s, d1, d2] = e.bytes;
    const st = s & 0xf0, ch = s & 15;
    if (st === 0x90 && d2 > 0) {
      this.active[ch].set(d1, d2);
      this.lastOn[ch] = e.at;
    } else if (st === 0x80 || st === 0x90) {
      this.active[ch].delete(d1);
    } else if (st === 0xb0 && (d1 === 120 || d1 === 123)) {
      this.active[ch].clear();
    }
  }

  clear(): void {
    this.queue = [];
    this.log.length = 0;
    for (const m of this.active) m.clear();
  }
}

const NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/** Human-readable description of a message. */
export function describe(bytes: number[]): string {
  const [s, a, b] = bytes;
  const ch = (s & 15) + 1;
  const n = (x: number) => `${NOTE[x % 12]}${Math.floor(x / 12) - 1}`;
  switch (s & 0xf0) {
    case 0x90:
      return b ? `ch${ch} ON  ${n(a)} v${b}` : `ch${ch} OFF ${n(a)}`;
    case 0x80:
      return `ch${ch} OFF ${n(a)}`;
    case 0xb0:
      return `ch${ch} CC${a}=${b}`;
    case 0xc0:
      return `ch${ch} PROG ${a + 1}`;
  }
  if (s === 0xf8) return 'CLOCK';
  if (s === 0xfa) return 'START';
  if (s === 0xfc) return 'STOP';
  return bytes.map((x) => x.toString(16).padStart(2, '0')).join(' ');
}

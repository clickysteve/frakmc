/**
 * Look-ahead MIDI scheduler.
 *
 * A timer in a Web Worker (not throttled like main-thread timers) wakes every 10 ms. Each wake
 * pulls source items up to `now + lookahead`, converts ticks to performance.now() times and
 * sends timestamped messages, so musical timing is set by the MIDI timestamps, not by when the
 * JavaScript runs. Fractal plotting runs in its own worker, and the UI draws from
 * requestAnimationFrame, so neither can delay the scheduler by more than the look-ahead.
 *
 * Time and timer are injectable so tests can drive it deterministically.
 */
import type { MidiSink } from '../midi/router';

export interface Cue {
  /** what to show: scan marks, Julia dots, tonality changes */
  kind: string;
  data: unknown;
}

export interface SourceItem {
  tick: number;
  bytes?: number[];
  cue?: Cue;
}

export interface Source {
  /** Push every item with tick < untilTick. Return false once the source has ended. */
  fill(untilTick: number, out: SourceItem[]): boolean;
  /** Called when playback stops (for whatever reason), with the tick sounding at that moment. */
  finish?(stopTick: number): void;
}

export interface Timer {
  start(cb: () => void): void;
  stop(): void;
}

const WORKER_SRC = 'let id=null;onmessage=e=>{if(e.data==="start"){if(id===null)id=setInterval(()=>postMessage(0),10)}else{clearInterval(id);id=null}}';

/** Worker-driven 10 ms timer, with a main-thread stand-in until the worker answers. */
export class WorkerTimer implements Timer {
  private worker: Worker | null = null;
  private fallback: ReturnType<typeof setInterval> | null = null;
  private alive = false;
  private cb: (() => void) | null = null;

  constructor() {
    if (typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
      this.worker.onmessage = () => {
        if (!this.alive) {
          this.alive = true;
          if (this.fallback) clearInterval(this.fallback);
          this.fallback = null;
        }
        this.cb?.();
      };
    } catch {
      this.worker = null;
    }
  }

  start(cb: () => void): void {
    this.cb = cb;
    this.worker?.postMessage('start');
    if (!this.worker || !this.alive) this.fallback = setInterval(() => this.cb?.(), 10);
  }

  stop(): void {
    this.cb = null;
    this.worker?.postMessage('stop');
    if (this.fallback) clearInterval(this.fallback);
    this.fallback = null;
  }
}

export interface PlayOptions {
  ppqn: number;
  tempo: number;
  clock: boolean;
}

export interface TimedCue extends Cue {
  at: number;
  tick: number;
}

export type StopReason = 'user' | 'ended' | 'error';

export class Scheduler {
  lookaheadMs = 100;
  startDelayMs = 40;
  private source: Source | null = null;
  private opts: PlayOptions = { ppqn: 96, tempo: 120, clock: false };
  private anchorMs = 0;
  private anchorTick = 0;
  /** source items are pulled up to here */
  private filledTick = 0;
  private nextClockTick = 0;
  private ended = false;
  private lastSentMs = 0;
  private readonly buf: SourceItem[] = [];
  /** cues waiting to be shown at their time */
  readonly cues: TimedCue[] = [];
  onStop: ((reason: StopReason) => void) | null = null;
  /** worst lateness seen (ms): how far behind the deadline the scheduler pulled an item */
  maxLateMs = 0;
  wakes = 0;

  constructor(
    private readonly sink: MidiSink & { releaseAll?(): number },
    private readonly timer: Timer = new WorkerTimer(),
    private readonly now: () => number = () => performance.now(),
  ) {}

  get playing(): boolean {
    return this.source !== null;
  }

  get tempo(): number {
    return this.opts.tempo;
  }

  private msPerTick(): number {
    return 60000 / (this.opts.tempo * this.opts.ppqn);
  }

  tickToMs(tick: number): number {
    return this.anchorMs + (tick - this.anchorTick) * this.msPerTick();
  }

  /** The tick sounding now. */
  get currentTick(): number {
    if (!this.source) return 0;
    return this.currentTickAt(this.now());
  }

  private currentTickAt(ms: number): number {
    return Math.max(0, this.anchorTick + (ms - this.anchorMs) / this.msPerTick());
  }

  start(source: Source, opts: PlayOptions): void {
    this.stop('user', true);
    this.source = source;
    this.opts = { ...opts };
    this.anchorMs = this.now() + this.startDelayMs;
    this.anchorTick = 0;
    this.filledTick = 0;
    this.nextClockTick = 0;
    this.ended = false;
    this.lastSentMs = this.anchorMs;
    this.maxLateMs = 0;
    this.cues.length = 0;
    if (opts.clock) this.sink.send([0xfa], this.anchorMs);
    this.timer.start(() => this.wake());
    this.wake();
  }

  /** Change tempo from the current position (live). */
  setTempo(bpm: number): void {
    if (bpm === this.opts.tempo) return;
    if (this.source) {
      const t = this.currentTick;
      this.anchorMs = this.now();
      this.anchorTick = t;
    }
    this.opts.tempo = bpm;
  }

  /** One scheduling pass (public for tests). */
  wake(): void {
    if (!this.source) return;
    this.wakes++;
    const now = this.now();
    const horizonTick = this.anchorTick + (now + this.lookaheadMs - this.anchorMs) / this.msPerTick();
    if (!this.ended && horizonTick > this.filledTick) {
      this.buf.length = 0;
      let more: boolean;
      try {
        more = this.source.fill(horizonTick, this.buf);
      } catch {
        this.stop('error');
        return;
      }
      for (const it of this.buf) {
        const at = this.tickToMs(it.tick);
        if (now - at > this.maxLateMs) this.maxLateMs = now - at;
        if (it.bytes) {
          this.sink.send(it.bytes, at);
          if (at > this.lastSentMs) this.lastSentMs = at;
        }
        if (it.cue) this.cues.push({ ...it.cue, at, tick: it.tick });
      }
      this.filledTick = horizonTick;
      if (!more) this.ended = true;
    }
    if (this.opts.clock) {
      const step = this.opts.ppqn / 24;
      while (this.nextClockTick < horizonTick && (!this.ended || this.tickToMs(this.nextClockTick) <= this.lastSentMs)) {
        this.sink.send([0xf8], this.tickToMs(this.nextClockTick));
        this.nextClockTick += step;
      }
    }
    if (this.ended && now >= this.lastSentMs) this.stop('ended');
  }

  /** Stop; the caller (router) releases notes. `silent` skips the callback. */
  stop(reason: StopReason = 'user', silent = false): void {
    if (!this.source) return;
    const src = this.source;
    this.source = null;
    this.timer.stop();
    if (this.opts.clock) this.sink.send([0xfc], this.now());
    src.finish?.(Math.min(this.currentTickAt(this.now()), this.filledTick));
    // every note switched on (or queued) gets its note-off
    this.sink.releaseAll?.();
    if (!silent) this.onStop?.(reason);
  }

  /** Cues whose time has come (removed from the queue). */
  takeDueCues(): TimedCue[] {
    const now = this.now();
    let i = 0;
    while (i < this.cues.length && this.cues[i].at <= now) i++;
    return this.cues.splice(0, i);
  }
}

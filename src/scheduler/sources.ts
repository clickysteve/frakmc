/**
 * Things the scheduler can play: a live composition (COMPOSE!) or a recorded/loaded sequence
 * (REPLAY and the MIDI-file player).
 */
import type { Composer, NoteEvent } from '../music/composer';
import type { Sequence, SeqEvent } from '../music/recording';
import type { Source, SourceItem } from './scheduler';

export const MAX_RECORDED_EVENTS = 200000;

export interface StepCue {
  scans: { box: number; x: number; y: number; count: number }[];
  dots: { track: number; sx: number; sy: number }[];
  tonality: { index: number; scale: number; transpose: number };
  notes: { track: number; note: number; velocity: number }[];
}

/**
 * COMPOSE!: steps the composer in real time and records what it plays — "the MIDI file in
 * memory". On stop, events queued beyond the stop point are dropped from the recording and
 * sounding notes are closed at the stop point, so the recording matches what was heard.
 */
export class ComposeSource implements Source {
  readonly recorded: NoteEvent[] = [];
  endTick = 0;
  full = false;
  private done = false;

  constructor(private readonly composer: Composer, private readonly maxEvents = MAX_RECORDED_EVENTS) {}

  fill(untilTick: number, out: SourceItem[]): boolean {
    while (!this.done && this.composer.tick < untilTick) {
      const r = this.composer.step();
      for (const e of r.events) {
        out.push({ tick: e.tick, bytes: [e.status, e.note, e.velocity] });
        this.recorded.push(e);
      }
      out.push({
        tick: r.tick,
        cue: {
          kind: 'step',
          data: {
            scans: r.scans, dots: r.dots, tonality: this.composer.tonality,
            notes: r.events.filter((e) => e.velocity).map((e) => ({ track: e.track, note: e.note, velocity: e.velocity })),
          } satisfies StepCue,
        },
      });
      if (this.recorded.length >= this.maxEvents) {
        this.full = true;
        this.done = true;
      }
      if (r.advance === 0 && r.events.length === 0) {
        // nothing can ever sound (all tracks muted)
        this.done = true;
      }
    }
    return !this.done;
  }

  finish(stopTick: number): void {
    const t = Math.max(0, Math.floor(stopTick));
    let i = this.recorded.length;
    while (i > 0 && this.recorded[i - 1].tick > t) i--;
    this.recorded.length = i;
    const on = new Map<string, NoteEvent>();
    for (const e of this.recorded) {
      const k = `${e.status}:${e.note}`;
      if (e.velocity) on.set(k, e);
      else on.delete(k);
    }
    for (const e of on.values()) this.recorded.push({ ...e, tick: t, velocity: 0 });
    this.endTick = t;
  }
}

/** REPLAY / player: play a sequence, optionally skipping muted tracks or messages. */
export class SequenceSource implements Source {
  private i = 0;

  constructor(private readonly seq: Sequence, private readonly skip: (e: SeqEvent) => boolean = () => false) {}

  fill(untilTick: number, out: SourceItem[]): boolean {
    const ev = this.seq.events;
    while (this.i < ev.length && ev[this.i].tick < untilTick) {
      const e = ev[this.i++];
      if (!this.skip(e)) out.push({ tick: e.tick, bytes: e.bytes });
      out.push({ tick: e.tick, cue: { kind: 'seq', data: e } });
    }
    if (this.i >= ev.length) {
      // run on to the end of the sequence so the last notes keep their length
      return untilTick < this.seq.endTick;
    }
    return true;
  }
}

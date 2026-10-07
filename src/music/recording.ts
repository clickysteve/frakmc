/**
 * The "MIDI file in memory": what COMPOSE! records and REPLAY / SAVE MIDI-FILE use.
 * A Sequence is a flat, tick-sorted list of raw MIDI messages with its division, so the same
 * player can replay a fresh composition or any loaded MIDI file.
 */
import { type Smf, type SmfEvent, readSmf, tempoEvent, tempoOf, textEvent, toFormat0, writeSmf } from '../midi/smf';
import type { NoteEvent } from './composer';

export interface SeqEvent {
  tick: number;
  bytes: number[];
  /** source track (composer track or SMF track) — used by the player for type-1 files */
  track: number;
}

export interface Sequence {
  ppqn: number;
  /** tempo the sequence was made at (quarter notes per minute) */
  tempo: number;
  events: SeqEvent[];
  endTick: number;
}

export function noteEventsToSequence(events: NoteEvent[], ppqn: number, tempo: number, endTick: number): Sequence {
  return {
    ppqn,
    tempo,
    events: events.map((e) => ({ tick: e.tick, bytes: [e.status, e.note, e.velocity], track: e.track })),
    endTick: Math.max(endTick, events.length ? events[events.length - 1].tick : 0),
  };
}

/**
 * Build a Standard MIDI File laid out as FMC2's were: format 0 (one track) or 1 (one track per
 * composer track), each starting with a text event. A tempo event is added when asked
 * (a modern addition — docs/UNCERTAINTIES.md U6).
 */
export function sequenceToSmf(seq: Sequence, format: 0 | 1, name: string, writeTempo: boolean): Smf {
  const label = (name || 'FRAKMC').toUpperCase().slice(0, 40);
  const head: SmfEvent[] = [textEvent(0, label)];
  if (writeTempo) head.push(tempoEvent(0, seq.tempo));
  const end: SmfEvent = { tick: seq.endTick, bytes: [0xff, 0x2f] };
  if (format === 0) {
    return { format: 0, division: seq.ppqn, tracks: [{ events: [...head, ...seq.events.map((e) => ({ tick: e.tick, bytes: e.bytes })), end] }] };
  }
  const ids = [...new Set(seq.events.map((e) => e.track))].sort((a, b) => a - b);
  const tracks = ids.map((id, i) => ({
    events: [...(i === 0 ? head : [textEvent(0, label)]), ...seq.events.filter((e) => e.track === id).map((e) => ({ tick: e.tick, bytes: e.bytes })), end],
  }));
  if (!tracks.length) tracks.push({ events: [...head, end] });
  return { format: 1, division: seq.ppqn, tracks };
}

export function sequenceToBytes(seq: Sequence, format: 0 | 1, name: string, writeTempo: boolean): Uint8Array {
  return writeSmf(sequenceToSmf(seq, format, name, writeTempo));
}

/** A loaded MIDI file as a playable Sequence (first tempo event, else 120). */
export function smfToSequence(smf: Smf): Sequence {
  const events: SeqEvent[] = [];
  let tempo = 120;
  let tempoFound = false;
  let endTick = 0;
  smf.tracks.forEach((tr, t) => {
    for (const e of tr.events) {
      endTick = Math.max(endTick, e.tick);
      const us = tempoOf(e);
      if (us && !tempoFound) {
        tempo = Math.round(60000000 / us);
        tempoFound = true;
      }
      if (e.bytes[0] < 0xf0) events.push({ tick: e.tick, bytes: e.bytes, track: t });
    }
  });
  events.sort((a, b) => a.tick - b.tick || a.track - b.track);
  return { ppqn: smf.division || 96, tempo, events, endTick };
}

export function bytesToSequence(bytes: Uint8Array): Sequence {
  return smfToSequence(readSmf(bytes));
}

export { toFormat0 };

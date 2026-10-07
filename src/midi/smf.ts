/**
 * Standard MIDI File reading and writing (formats 0 and 1). Pure; works on byte arrays.
 */

export interface SmfEvent {
  tick: number;
  /** read with running status (informational) */
  rs?: boolean;
  /** channel message bytes, or meta [0xFF, type, ...data], or sysex [0xF0|0xF7, ...data] */
  bytes: number[];
}

export interface SmfTrack {
  events: SmfEvent[];
}

export interface Smf {
  format: 0 | 1 | 2;
  division: number;
  tracks: SmfTrack[];
}

export class SmfError extends Error {}

function vlq(n: number): number[] {
  let v = Math.max(0, Math.floor(n));
  const out = [v & 0x7f];
  while ((v >>>= 7) > 0) out.unshift((v & 0x7f) | 0x80);
  return out;
}

function u32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

/** Serialise. Events in each track are sorted stably by tick; an end-of-track is appended. */
export function writeSmf(smf: Smf): Uint8Array {
  const out: number[] = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, smf.format, (smf.tracks.length >> 8) & 255, smf.tracks.length & 255,
    (smf.division >> 8) & 255, smf.division & 255];
  for (const tr of smf.tracks) {
    const evs = tr.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.tick - b.e.tick || a.i - b.i).map((x) => x.e);
    const body: number[] = [];
    let last = 0;
    for (const e of evs) {
      if (e.bytes[0] === 0xff && e.bytes[1] === 0x2f) continue;
      body.push(...vlq(e.tick - last));
      last = e.tick;
      const b = e.bytes;
      if (b[0] === 0xff) body.push(0xff, b[1], ...vlq(b.length - 2), ...b.slice(2));
      else if (b[0] === 0xf0 || b[0] === 0xf7) body.push(b[0], ...vlq(b.length - 1), ...b.slice(1));
      else body.push(...b);
    }
    body.push(0, 0xff, 0x2f, 0);
    out.push(0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body);
  }
  return Uint8Array.from(out);
}

const DATA_LEN: Record<number, number> = { 0x80: 2, 0x90: 2, 0xa0: 2, 0xb0: 2, 0xc0: 1, 0xd0: 1, 0xe0: 2 };

/** Parse. Handles running status, meta and sysex; rejects malformed files with SmfError. */
export function readSmf(data: Uint8Array): Smf {
  let p = 0;
  const need = (n: number) => {
    if (p + n > data.length) throw new SmfError('Truncated MIDI file');
  };
  const rd32 = () => {
    need(4);
    const v = ((data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3]) >>> 0;
    p += 4;
    return v;
  };
  const rd16 = () => {
    need(2);
    const v = (data[p] << 8) | data[p + 1];
    p += 2;
    return v;
  };
  const tag = () => {
    need(4);
    const s = String.fromCharCode(data[p], data[p + 1], data[p + 2], data[p + 3]);
    p += 4;
    return s;
  };
  if (tag() !== 'MThd') throw new SmfError('Not a standard MIDI file');
  const hlen = rd32();
  const format = rd16();
  const ntrks = rd16();
  const division = rd16();
  p += Math.max(0, hlen - 6);
  if (format > 2) throw new SmfError('Unknown MIDI file type');
  if (division & 0x8000) throw new SmfError('SMPTE time division is not supported');
  const tracks: SmfTrack[] = [];
  for (let t = 0; t < ntrks && p < data.length; t++) {
    const id = tag();
    const len = rd32();
    need(len);
    const end = p + len;
    if (id !== 'MTrk') {
      p = end;
      t--;
      continue;
    }
    const events: SmfEvent[] = [];
    let tick = 0;
    let running = 0;
    const rv = () => {
      let v = 0;
      for (let i = 0; i < 4; i++) {
        if (p >= end) throw new SmfError('Truncated event');
        const b = data[p++];
        v = (v << 7) | (b & 0x7f);
        if (!(b & 0x80)) return v;
      }
      throw new SmfError('Bad variable-length number');
    };
    while (p < end) {
      tick += rv();
      if (p >= end) throw new SmfError('Truncated event');
      let st = data[p];
      if (st === 0xff) {
        p++;
        const type = data[p++];
        const n = rv();
        if (p + n > end) throw new SmfError('Truncated meta event');
        events.push({ tick, bytes: [0xff, type, ...data.slice(p, p + n)] });
        p += n;
        if (type === 0x2f) break;
      } else if (st === 0xf0 || st === 0xf7) {
        p++;
        const n = rv();
        if (p + n > end) throw new SmfError('Truncated sysex');
        events.push({ tick, bytes: [st, ...data.slice(p, p + n)] });
        p += n;
      } else {
        let rs = false;
        if (st & 0x80) {
          running = st;
          p++;
        } else {
          if (!running) throw new SmfError('Data byte without status');
          st = running;
          rs = true;
        }
        const n = DATA_LEN[st & 0xf0] ?? 0;
        if (p + n > end) throw new SmfError('Truncated channel message');
        events.push(rs ? { tick, bytes: [st, ...data.slice(p, p + n)], rs } : { tick, bytes: [st, ...data.slice(p, p + n)] });
        p += n;
      }
    }
    p = end;
    tracks.push({ events });
  }
  return { format: format as 0 | 1 | 2, division, tracks };
}

export function textEvent(tick: number, text: string, type = 0x01): SmfEvent {
  return { tick, bytes: [0xff, type, ...Array.from(text, (c) => c.charCodeAt(0) & 0x7f)] };
}

export function tempoEvent(tick: number, bpm: number): SmfEvent {
  const us = Math.round(60000000 / bpm);
  return { tick, bytes: [0xff, 0x51, (us >> 16) & 255, (us >> 8) & 255, us & 255] };
}

/** Microseconds per quarter from a tempo meta event, or null. */
export function tempoOf(e: SmfEvent): number | null {
  const b = e.bytes;
  return b[0] === 0xff && b[1] === 0x51 && b.length >= 5 ? (b[2] << 16) | (b[3] << 8) | b[4] : null;
}

/** Type 1 → 0: merge all tracks into one (stable by tick, then track order). */
export function toFormat0(smf: Smf): Smf {
  const all: { e: SmfEvent; t: number; i: number }[] = [];
  smf.tracks.forEach((tr, t) => tr.events.forEach((e, i) => {
    if (!(e.bytes[0] === 0xff && e.bytes[1] === 0x2f)) all.push({ e, t, i });
  }));
  all.sort((a, b) => a.e.tick - b.e.tick || a.t - b.t || a.i - b.i);
  return { format: 0, division: smf.division, tracks: [{ events: all.map((x) => x.e) }] };
}

/**
 * Type 0 → 1, giving each MIDI channel its own track, as FMC2's converter did:
 * track 1 holds meta/sysex events, then one track per channel in use.
 */
export function toFormat1(smf: Smf): Smf {
  const merged = smf.format === 0 ? smf : toFormat0(smf);
  const meta: SmfEvent[] = [];
  const byChan = new Map<number, SmfEvent[]>();
  for (const e of merged.tracks[0]?.events ?? []) {
    if (e.bytes[0] >= 0xf0) meta.push(e);
    else {
      const ch = e.bytes[0] & 15;
      if (!byChan.has(ch)) byChan.set(ch, []);
      byChan.get(ch)!.push(e);
    }
  }
  const tracks: SmfTrack[] = [{ events: meta }];
  for (const ch of [...byChan.keys()].sort((a, b) => a - b)) tracks.push({ events: byChan.get(ch)! });
  return { format: 1, division: merged.division, tracks };
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

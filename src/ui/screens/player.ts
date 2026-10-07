/**
 * MIDI FILE ANALYSER: player, filter and converter. Shows which data each track
 * holds, mutes (on playback) or filters (deletes) selected data, converts type 0 ↔ 1, plays
 * and saves. Opens on the composition in memory.
 */
import type { App } from '../../app/app';
import { type Smf, type SmfEvent, readSmf, toFormat0, toFormat1, writeSmf } from '../../midi/smf';
import { sequenceToSmf, smfToSequence } from '../../music/recording';
import { LIMITS } from '../../state/document';
import { alertBox, modal } from '../alert';
import { button, cell, download, label, pickFile } from '../dom';
import { DialogScreen } from './base';

const OTHER = ['RS', 'SX', 'MT', 'TO', 'TX'] as const;
type Other = (typeof OTHER)[number];
const VISIBLE = 8;

function otherOf(e: SmfEvent): Other[] {
  const b = e.bytes;
  const out: Other[] = [];
  if (e.rs) out.push('RS');
  if (b[0] === 0xf0 || b[0] === 0xf7) out.push('SX');
  if (b[0] === 0xff) {
    out.push('MT');
    if (b[1] === 0x51) out.push('TO');
    if (b[1] >= 1 && b[1] <= 7) out.push('TX');
  }
  return out;
}

export class PlayerScreen extends DialogScreen {
  readonly name = 'player';
  private smf: Smf | null = null;
  private fileName = 'UNSAVED';
  private top = 0;
  private tempo = 120;
  private clock = false;
  /** selected data boxes: `${track}:c${chan}` `${track}:s${hex}` `${track}:o${OTHER}` */
  private selected = new Set<string>();

  constructor(app: App) {
    super(app, 592, 346);
    if (app.recording) {
      this.smf = sequenceToSmf(app.recording, app.doc.main.midiType, app.doc.name, app.doc.options.writeTempo);
      this.tempo = app.doc.main.tempo;
    }
  }

  private get size(): number {
    return this.smf ? writeSmf(this.smf).length : 0;
  }

  protected build(root: HTMLDivElement): void {
    const app = this.app;
    this.titleBar('MIDI FILE ANALYSER');
    this.group(8, 32, 400, 40, 'FILE');
    const info = label(root, 16, 42, 386, 24, '', 'left');
    this.r.fn(() => {
      info.textContent = this.smf
        ? `${this.fileName.slice(0, 16).padEnd(16)}  TYPE ${this.smf.format}  ${String(this.smf.tracks.length).padStart(2)} TRACKS  ${this.size} BYTES`
        : 'NO FILE — LOAD ONE, OR COMPOSE FIRST';
    });
    this.r.add(button(root, 416, 32, 54, 40, 'HELP', () => void this.help(), { cls: 'shadow' }));
    this.r.add(button(root, 476, 32, 108, 40, 'CLOSE', () => {
      app.stop();
      app.go('startup');
    }, { cls: 'exit' }));

    this.small(82, 80, 256, 12, 'CHANNELS 1-16 (shown 0-F)');
    this.small(346, 80, 116, 12, 'MESSAGE TYPES');
    this.small(466, 80, 110, 12, 'OTHER DATA');
    this.small(8, 80, 60, 12, 'TRACK');
    this.r.add(cell(root, 14, 96, 40, 24, {
      get: () => this.top + 1, set: (v) => {
        this.top = v - 1;
        this.refresh();
      }, min: 1, max: 32, label: 'First track shown', title: 'First track shown (left −, right +)',
    }));
    this.small(18, 124, 40, 14, 'to');
    const last = label(root, 14, 140, 40, 24, '', 'txt box');
    this.r.fn(() => (last.textContent = String(Math.min(this.top + VISIBLE, Math.max(1, this.smf?.tracks.length ?? 1)))));
    this.small(6, 176, 62, 110, 'BOLD:\nPRESENT\n\nCLICK TO\nSELECT;\nPLAY\nMUTES,\nFILTER\nDELETES');
    this.group(70, 92, 514, 200);

    for (let r = 0; r < VISIBLE; r++) {
      const y = 96 + 24 * r;
      const ti = () => this.top + r;
      const present = (test: (e: SmfEvent) => boolean) => () => {
        const tr = this.smf?.tracks[ti()];
        return !!tr && tr.events.some(test);
      };
      const toggle = (key: () => string, has: () => boolean) => () => {
        if (!has()) return;
        const k = key();
        if (this.selected.has(k)) this.selected.delete(k);
        else this.selected.add(k);
        this.refresh();
      };
      const mk = (x: number, w: number, text: string, key: () => string, has: () => boolean, title: string) => {
        const b = button(root, x, y, w, 24, text, toggle(key, has), { title, selected: () => this.selected.has(key()) });
        this.r.add(b);
        this.r.fn(() => {
          const h = has();
          b.el.style.opacity = h ? '1' : '.3';
          b.el.style.fontWeight = h ? 'bold' : 'normal';
          b.el.style.cursor = h ? 'pointer' : 'default';
        });
      };
      for (let c = 0; c < 16; c++) {
        mk(76 + 16 * c, 16, c.toString(16).toUpperCase(), () => `${ti()}:c${c}`, present((e) => e.bytes[0] < 0xf0 && (e.bytes[0] & 15) === c), `Channel ${c + 1}`);
      }
      for (let st = 8; st <= 14; st++) {
        mk(346 + 16 * (st - 8), 16, st.toString(16).toUpperCase(), () => `${ti()}:s${st}`, present((e) => e.bytes[0] >> 4 === st), ['note off', 'note on', 'key pressure', 'controller', 'program change', 'channel pressure', 'pitch bend'][st - 8]);
      }
      OTHER.forEach((o, i) => {
        mk(466 + 22 * i, 22, o, () => `${ti()}:o${o}`, present((e) => otherOf(e).includes(o)), { RS: 'running status', SX: 'system exclusive', MT: 'meta event', TO: 'tempo', TX: 'text' }[o]);
      });
    }

    this.r.add(button(root, 8, 302, 96, 34, 'LOAD MIDI', () => void this.load(), { cls: 'shadow' }));
    this.group(112, 300, 156, 38, 'PLAY');
    this.r.add(cell(root, 118, 308, 40, 24, {
      get: () => this.tempo, set: (v) => {
        this.tempo = v;
        app.setLiveTempo(v);
        this.refresh();
      }, min: LIMITS.tempo[0], max: LIMITS.tempo[1], label: 'Player tempo', title: 'Tempo (quarter notes per minute)',
    }));
    this.r.add(button(root, 162, 308, 48, 24, 'PLAY', () => this.play(), { cls: 'shadow', selected: () => app.mode === 'player', disabled: () => !this.smf || (app.scheduler.playing && app.mode !== 'player'), title: 'Play (selected data is muted). Space stops.' }));
    this.r.add(button(root, 214, 308, 50, 24, 'CLOCK', () => {
      this.clock = !this.clock;
      this.refresh();
    }, { selected: () => this.clock, title: 'Send MIDI clock while playing' }));
    this.r.add(button(root, 276, 302, 72, 34, 'CONVERT', () => this.convert(), { cls: 'shadow', disabled: () => !this.smf, title: 'Switch between type 0 and type 1' }));
    this.r.add(button(root, 354, 302, 72, 34, 'FILTER', () => void this.filter(), { cls: 'shadow', disabled: () => !this.smf || !this.selected.size, title: 'Delete the selected data from the file in memory' }));
    this.r.add(button(root, 432, 302, 64, 34, 'CLEAR', () => {
      this.selected.clear();
      this.refresh();
    }, { cls: 'shadow', title: 'Deselect everything' }));
    this.r.add(button(root, 502, 302, 82, 34, 'SAVE MIDI', () => this.save(), { cls: 'shadow', disabled: () => !this.smf }));
  }

  private matches(e: SmfEvent, track: number): boolean {
    const b = e.bytes[0];
    if (b < 0xf0) return this.selected.has(`${track}:c${b & 15}`) || this.selected.has(`${track}:s${b >> 4}`);
    return otherOf(e).some((o) => o !== 'RS' && this.selected.has(`${track}:o${o}`));
  }

  private play(): void {
    const app = this.app;
    if (app.mode === 'player') {
      app.stop();
      return;
    }
    if (!this.smf) return;
    const seq = smfToSequence(this.smf);
    app.playSequence(seq, this.tempo, this.clock, (e) => this.matches({ tick: 0, bytes: e.bytes }, e.track));
  }

  private convert(): void {
    if (!this.smf) return;
    this.app.stop();
    this.smf = this.smf.format === 0 ? toFormat1(this.smf) : toFormat0(this.smf);
    this.selected.clear();
    this.top = 0;
    this.refresh();
  }

  private async filter(): Promise<void> {
    if (!this.smf) return;
    const ok = await alertBox(3, ['', 'DELETE THE SELECTED DATA', 'FROM THE FILE IN MEMORY?', ''], ['DELETE', 'CANCEL'], 1);
    if (ok !== 0) return;
    this.app.stop();
    this.smf = {
      ...this.smf,
      tracks: this.smf.tracks.map((tr, t) => ({
        events: tr.events.filter((e) => !this.matches(e, t)).map((e) => (this.selected.has(`${t}:oRS`) ? { tick: e.tick, bytes: e.bytes } : e)),
      })),
    };
    this.selected.clear();
    this.refresh();
  }

  private save(): void {
    if (!this.smf) return;
    const name = this.fileName === 'UNSAVED' ? this.app.doc.name || 'FRAKMC' : this.fileName.replace(/\.MID$/i, '');
    download(`${name}.MID`, writeSmf(this.smf), 'audio/midi');
  }

  private async load(): Promise<void> {
    const f = await pickFile('.mid,.midi,.MID,audio/midi');
    if (!f) return;
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const smf = readSmf(bytes);
      if (smf.format === 2) throw new Error('TYPE 2 FILES ARE NOT SUPPORTED');
      if (smf.tracks.length > 32) throw new Error('MORE THAN 32 TRACKS');
      this.app.stop();
      this.smf = smf;
      this.fileName = f.name.toUpperCase();
      this.tempo = smfToSequence(smf).tempo;
      this.selected.clear();
      this.top = 0;
      this.refresh();
    } catch (e) {
      await alertBox(1, ['', 'THAT FILE COULD NOT BE READ', String((e as Error).message).toUpperCase().slice(0, 30), ''], ['O.K.']);
    }
  }

  private help(): Promise<void> {
    return modal(300, 300, ({ root, close }) => {
      label(root, 8, 8, 284, 22, 'WHAT THE BOXES MEAN', 'txt box');
      const lines = [
        'MESSAGE TYPES (status nibble)', ' 8 note off       9 note on',
        ' A key pressure   B controller', ' C program        D channel pressure', ' E pitch bend', '',
        'OTHER DATA', ' RS  messages using running status', ' SX  system exclusive', ' MT  any meta event',
        ' TO  tempo meta event', ' TX  text meta events', '',
        'A note on with velocity 0 counts', 'as a note off when played.',
      ];
      label(root, 16, 36, 276, 224, lines.join('\n'), 'small').style.alignItems = 'flex-start';
      button(root, 110, 266, 80, 26, 'O.K.', () => close(), { cls: 'exit' });
    });
  }

  refresh(): void {
    const n = this.smf?.tracks.length ?? 0;
    if (this.top > Math.max(0, n - 1)) this.top = Math.max(0, n - 1);
    super.refresh();
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key === 'Escape') {
      this.app.stop();
      this.app.go('startup');
      return true;
    }
    return false;
  }
}

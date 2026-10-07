/**
 * RHYTHM MAP: the note lengths each track chooses from (docs/BEHAVIOUR.md §6).
 */
import type { App } from '../../app/app';
import { LIMITS, MAX_LENGTHS, MAX_TRACKS, MULTIPLIERS, clone } from '../../state/document';
import { button, cell, label } from '../dom';
import { DialogScreen } from './base';

export class RhythmScreen extends DialogScreen {
  readonly name = 'rhythm';

  constructor(app: App) {
    super(app, 612, 290);
  }

  protected build(root: HTMLDivElement): void {
    const app = this.app;
    const rh = () => app.doc.rhythm;
    const julia = () => app.doc.main.fractalType === 'julia';
    const edit = app.edit.bind(app);
    const shown = (t: number) => t < app.doc.main.numTracks;

    this.titleBar('RHYTHM MAP');
    this.group(8, 32, 162, 34, 'LENGTH ×');
    MULTIPLIERS.forEach((m, i) => {
      this.r.add(button(root, 16 + i * 37, 39, 35, 22, `×${m}`, () => edit((d) => (d.rhythm.multiplier = m)), {
        selected: () => rh().multiplier === m, title: `Every length is multiplied by ${m} to give MIDI ticks (×8 at 96 PPQN: 12 = a crotchet)`,
      }));
    });
    this.setupSlots(180, 32, () => app.doc.slots.rhythm, (n) => edit((d) => (d.slots.rhythm = n)), () => edit((d) => (d.banks.rhythm[d.slots.rhythm] = clone(d.rhythm))), () => {
      const rec = app.doc.banks.rhythm[app.doc.slots.rhythm];
      if (!rec) void this.emptySlot();
      else edit((d) => (d.rhythm = clone(rec)));
    });
    this.r.add(button(root, 504, 32, 100, 34, 'CLOSE', () => app.go('main'), { cls: 'exit' }));

    this.group(4, 74, 604, 26 * MAX_TRACKS + 26);
    const head = (x: number, w: number, text: string) => (this.small(x, 80, w, 12, text).style.justifyContent = 'center');
    head(8, 18, '#');
    head(30, 64, 'TYPE');
    head(98, 32, 'REPS');
    head(134, 28, 'USE');
    this.small(166, 80, 420, 12, 'LENGTHS  (the first, framed thick, is the repeating length)');

    for (let t = 0; t < MAX_TRACKS; t++) {
      const y = 96 + 26 * t;
      const tr = () => rh().tracks[t];
      const off = () => !shown(t);
      const n = label(root, 8, y, 18, 24, String(t + 1), 'txt');
      this.r.fn(() => (n.style.opacity = off() ? '.35' : '1'));
      for (const [i, type] of [[0, 'DUR'], [1, 'SEQ']] as const) {
        this.r.add(button(root, 30 + 32 * i, y, 32, 24, type, () => edit((d) => (d.rhythm.tracks[t].type = type)), {
          selected: () => (julia() ? type === 'SEQ' : tr().type === type),
          disabled: () => off() || (julia() && type === 'DUR'),
          title: type === 'DUR' ? 'DUR: the length box picks one of the lengths' : 'SEQ: the lengths play in order, round and round',
        }));
      }
      this.r.add(cell(root, 98, y, 32, 24, {
        get: () => tr().nReps, set: (v) => edit((d) => (d.rhythm.tracks[t].nReps = v)), min: LIMITS.nReps[0], max: LIMITS.nReps[1],
        disabled: off, cls: () => (tr().type === 'SEQ' || julia() ? 'dim' : ''), label: `Track ${t + 1} N.REPS`,
        title: 'N.REPS: how many notes in a row use the first length once it is picked (DUR only)',
      }));
      this.r.add(cell(root, 134, y, 28, 24, {
        get: () => tr().count, set: (v) => edit((d) => (d.rhythm.tracks[t].count = v)), min: LIMITS.count[0], max: LIMITS.count[1],
        disabled: off, label: `Track ${t + 1} number of lengths`, title: 'How many of the lengths this track uses',
      }));
      for (let k = 0; k < MAX_LENGTHS; k++) {
        this.r.add(cell(root, 168 + 27 * k, y, 27, 24, {
          get: () => tr().lengths[k], set: (v) => edit((d) => (d.rhythm.tracks[t].lengths[k] = v)), min: LIMITS.length[0], max: LIMITS.length[1],
          disabled: off, cls: () => `${k === 0 ? 'thick ' : ''}${k >= tr().count ? 'dim' : ''}`,
          label: `Track ${t + 1} length ${k + 1}`,
          title: () => `${lengthName(tr().lengths[k] * rh().multiplier, app.doc.main.ppqn)}${k === 0 ? ' — repeating length' : ''}`,
        }));
      }
    }
    this.small(8, 262, 596, 24, 'Left −, right +.  DUR lengths come from each track\'s length box; SEQ plays them in order.\nJulia mode always uses SEQ.');
  }
}

/** A friendly name for a length in ticks. */
export function lengthName(ticks: number, ppqn: number): string {
  const q = ticks / ppqn;
  const names: [number, string][] = [[8, 'breve'], [4, 'semibreve'], [3, 'dotted minim'], [2, 'minim'], [1.5, 'dotted crotchet'], [1, 'crotchet'], [2 / 3, 'triplet crotchet'],
    [0.75, 'dotted quaver'], [0.5, 'quaver'], [1 / 3, 'triplet quaver'], [0.25, 'semiquaver'], [1 / 6, 'triplet semiquaver'], [0.125, 'demisemiquaver'], [1 / 12, 'triplet demisemiquaver']];
  const hit = names.find(([v]) => Math.abs(v - q) < 1e-6);
  return `${ticks} ticks = ${q.toFixed(q % 1 ? 3 : 0)} quarter${q === 1 ? '' : 's'}${hit ? ` (${hit[1]})` : ''}`;
}

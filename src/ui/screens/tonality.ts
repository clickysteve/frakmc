/**
 * TONALITY MAP and the SCALE PATTERN editor (docs/BEHAVIOUR.md §5.3–§5.4, §9).
 */
import type { App } from '../../app/app';
import { encodeScaleSet, decodeScaleSet } from '../../persistence/fmcFiles';
import {
  CELL_REST, CELL_TIE, EDIT_ROWS, LIMITS, SCALE_COUNT, SCALE_ROWS, type ScalePattern, clone,
} from '../../state/document';
import { alertBox } from '../alert';
import { button, cell, download, el, label, ob, pickFile } from '../dom';
import { DialogScreen, NOTE_NAMES } from './base';

export class TonalityScreen extends DialogScreen {
  readonly name = 'tonality';

  constructor(app: App) {
    super(app, 612, 384);
  }

  protected build(root: HTMLDivElement): void {
    const app = this.app;
    const tm = () => app.doc.tonality;
    const edit = app.edit.bind(app);

    this.titleBar('TONALITY MAP');
    // the scale-pattern slots, 2 × 6; a click opens that pattern in the editor
    this.group(8, 32, 470, 62, 'SCALE PATTERNS');
    for (let i = 0; i < SCALE_COUNT; i++) {
      const c = i % 6, r = Math.floor(i / 6);
      const b = button(root, 14 + 77 * c, 40 + 26 * r, 75, 24, '', () => app.openScale(i), {
        title: `Scale ${i + 1}: open it in the scale-pattern editor`,
        text: () => `${String(i + 1).padStart(2)} ${app.doc.scales[i].name}`,
      });
      b.el.style.justifyContent = 'flex-start';
      b.el.style.fontSize = '14px';
      this.r.add(b);
    }
    this.group(486, 32, 118, 62, 'PATTERN SET');
    this.r.add(button(root, 494, 40, 50, 24, 'LOAD', () => void this.loadScales(), { title: 'Load 12 scale patterns from an .SCA file (FMC2-compatible format)' }));
    this.r.add(button(root, 548, 40, 50, 24, 'SAVE', () => void this.saveScales(), { title: 'Save the 12 scale patterns as an .SCA file (FMC2-compatible format)' }));
    this.r.add(button(root, 494, 66, 104, 24, 'EDIT…', () => app.go('scales'), { title: 'Open the scale-pattern editor' }));

    this.group(8, 106, 210, 60, 'MAP');
    label(root, 16, 116, 140, 20, 'TONALITIES USED');
    this.r.add(cell(root, 172, 114, 38, 22, {
      get: () => tm().count, set: (v) => edit((d) => (d.tonality.count = v)), min: LIMITS.tonalities[0], max: LIMITS.tonalities[1], cls: 'thick',
      label: 'Number of tonalities', title: 'How many tonalities the map plays before starting again',
    }));
    label(root, 16, 140, 140, 20, 'TRANSPOSE ALL');
    this.r.add(cell(root, 172, 138, 38, 22, {
      get: () => tm().globalTranspose, set: (v) => edit((d) => (d.tonality.globalTranspose = v)), min: LIMITS.globalTranspose[0], max: LIMITS.globalTranspose[1],
      fmt: signed, label: 'Global transpose', title: 'Added to every tonality (−12…+12 semitones)',
    }));
    this.setupSlots(226, 106, () => app.doc.slots.tonality, (n) => edit((d) => (d.slots.tonality = n)), () => edit((d) => (d.banks.tonality[d.slots.tonality] = clone(d.tonality))), () => {
      const rec = app.doc.banks.tonality[app.doc.slots.tonality];
      if (!rec) void this.emptySlot();
      else edit((d) => (d.tonality = clone(rec)));
    });
    this.r.add(button(root, 534, 106, 70, 34, 'CLOSE', () => app.go('main'), { cls: 'exit' }));
    this.small(226, 146, 380, 20, 'Each column: scale, transposition, length in quarter notes.');

    for (let b = 0; b < 3; b++) {
      const y = 176 + 68 * b;
      this.group(8, y, 596, 64);
      this.small(14, y + 4, 70, 12, `${b * 12 + 1}-${b * 12 + 12}`);
      this.small(14, y + 18, 70, 14, 'SCALE');
      this.small(14, y + 32, 70, 14, 'TRANSPOSE');
      this.small(14, y + 46, 70, 14, 'QUARTERS');
      for (let c = 0; c < 12; c++) {
        const i = b * 12 + c;
        const t = () => tm().tonalities[i];
        const used = () => i < tm().count;
        const cls = () => (used() ? (app.composer && app.composer.tonality.index === i ? 'now' : '') : 'dim');
        const x = 92 + 42 * c;
        this.small(x, y + 4, 42, 12, String(i + 1)).style.justifyContent = 'center';
        this.r.add(cell(root, x, y + 16, 42, 16, {
          get: () => t().scale, set: (v) => edit((d) => (d.tonality.tonalities[i].scale = v)), min: LIMITS.scale[0], max: LIMITS.scale[1], cls,
          label: `Tonality ${i + 1} scale`, title: () => `Tonality ${i + 1}: scale ${t().scale} ${app.doc.scales[t().scale - 1].name}`,
        }));
        this.r.add(cell(root, x, y + 32, 42, 16, {
          get: () => t().transpose, set: (v) => edit((d) => (d.tonality.tonalities[i].transpose = v)), min: LIMITS.transpose[0], max: LIMITS.transpose[1], cls, fmt: signed,
          label: `Tonality ${i + 1} transpose`, title: () => `Tonality ${i + 1}: ${signed(t().transpose)} semitones (root ${NOTE_NAMES[(((t().transpose + tm().globalTranspose) % 12) + 12) % 12]})`,
        }));
        this.r.add(cell(root, x, y + 48, 42, 16, {
          get: () => t().quarters, set: (v) => edit((d) => (d.tonality.tonalities[i].quarters = v)), min: LIMITS.quarters[0], max: LIMITS.quarters[1], cls,
          label: `Tonality ${i + 1} quarter notes`, title: () => `Tonality ${i + 1}: lasts ${t().quarters} quarter notes`,
        }));
      }
    }
  }

  private async loadScales(): Promise<void> {
    const f = await pickFile('.sca,.SCA');
    if (!f) return;
    try {
      const scales = decodeScaleSet(new Uint8Array(await f.arrayBuffer()));
      this.app.edit((d) => {
        d.scales = scales;
        d.scaleSetName = f.name.replace(/\..*$/, '').toUpperCase().slice(0, 8);
      });
    } catch (e) {
      await alertBox(3, ['', String((e as Error).message).toUpperCase(), ''], ['O.K.']);
    }
  }

  private async saveScales(): Promise<void> {
    download(`${this.app.doc.scaleSetName || 'SCALES'}.SCA`, encodeScaleSet(this.app.doc.scales), 'application/octet-stream');
  }
}

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/** Display of a scale-pattern cell in row-column c: the note it gives, or T* / R*. */
export function cellText(offset: number, c: number): string {
  if (offset === CELL_TIE) return 'T*';
  if (offset === CELL_REST) return 'R*';
  const t = c + offset;
  if (t === 12) return 'C+';
  if (t < 0) return `${NOTE_NAMES[(t + 12) % 12]}-`;
  if (t > 12) return `${NOTE_NAMES[t % 12]}+`;
  return NOTE_NAMES[t];
}

export class ScaleScreen extends DialogScreen {
  readonly name = 'scales';
  /** working copy of the pattern on show; STORE writes it */
  private work: ScalePattern;
  private slot: number;
  private number: number;

  constructor(app: App) {
    super(app, 400, 330);
    this.slot = this.number = app.scaleSlot;
    this.work = clone(app.doc.scales[this.slot]);
  }

  protected build(root: HTMLDivElement): void {
    const app = this.app;
    this.titleBar(() => `SCALE PATTERN ${this.number + 1}`);
    this.group(8, 32, 384, 34, 'SLOT');
    for (let i = 0; i < SCALE_COUNT; i++) {
      this.r.add(button(root, 14 + 26 * i, 39, 26, 22, String(i + 1), () => {
        this.slot = i;
        this.refresh();
      }, { selected: () => this.slot === i, title: `Slot ${i + 1}: ${app.doc.scales[i].name}` }));
    }
    this.r.add(button(root, 334, 39, 52, 22, 'SHOW', () => {
      this.work = clone(app.doc.scales[this.slot]);
      this.number = this.slot;
      this.refresh();
    }, { title: 'Show the pattern stored in the selected slot' }));

    label(root, 12, 76, 50, 22, 'NAME');
    const name = el('input', 'name-input');
    name.maxLength = 9;
    name.setAttribute('aria-label', 'Scale name');
    ob(root, 'div', '', 60, 75, 110, 24).appendChild(name);
    name.style.width = '110px';
    name.addEventListener('input', () => (this.work.name = name.value.toUpperCase()));
    name.addEventListener('keydown', (e) => e.stopPropagation());
    this.r.fn(() => {
      if (document.activeElement !== name) name.value = this.work.name;
    });
    this.small(184, 76, 206, 24, 'Each cell: the note played instead of\nthe one above it.  T* holds, R* rests.');

    // column headings: the chromatic notes before the pattern applies
    NOTE_NAMES.forEach((n, c) => label(root, 52 + 28 * c, 106, 28, 14, n, 'txt small'));
    this.small(8, 106, 40, 14, 'S.O');
    this.group(48, 120, 344, 152);
    for (let r = 0; r < EDIT_ROWS; r++) {
      const row = EDIT_ROWS - 1 - r; // top row is S.O 6
      const y = 124 + 24 * r;
      label(root, 12, y, 30, 24, String(row + 1), 'txt');
      for (let c = 0; c < 12; c++) {
        // the choices, in order: R*, T*, then this column's notes from C up to C+
        const values = () => [CELL_REST + 1000, CELL_TIE + 1000, ...Array.from({ length: 13 }, (_, t) => t - c)];
        const enc = (v: number) => (v === CELL_TIE ? CELL_TIE + 1000 : v === CELL_REST ? CELL_REST + 1000 : v);
        this.r.add(cell(root, 52 + 28 * c, y, 28, 24, {
          get: () => enc(this.work.rows[row][c]),
          set: (v) => {
            this.work.rows[row][c] = v >= 1000 ? v - 1000 : v;
            this.refresh();
          },
          min: -99, max: 2000, values,
          fmt: (v) => cellText(v >= 1000 ? v - 1000 : v, c),
          label: `S.O ${row + 1} ${NOTE_NAMES[c]}`,
          title: `S.O ${row + 1}, ${NOTE_NAMES[c]}: the note played in its place (left −, right +)`,
        }));
      }
    }
    this.r.add(button(root, 52, 286, 150, 30, 'STORE IN SLOT', () => void this.write(), { cls: 'shadow', title: 'Keep the edited pattern in the selected slot (edits are lost otherwise)' }));
    this.r.add(button(root, 300, 286, 92, 30, 'CLOSE', () => app.go('tonality'), { cls: 'exit' }));
  }

  private async write(): Promise<void> {
    const ok = await alertBox(2, ['', `STORE THIS PATTERN IN`, `SLOT ${this.slot + 1}?`, ''], ['STORE', 'CANCEL'], 0);
    if (ok !== 0) return;
    const p = clone(this.work);
    p.name = (p.name || 'SCALE').toUpperCase().slice(0, 9);
    // the top row carries on upwards (docs/UNCERTAINTIES.md U4)
    for (let r = EDIT_ROWS; r < SCALE_ROWS; r++) p.rows[r] = [...p.rows[EDIT_ROWS - 1]];
    this.app.edit((d) => (d.scales[this.slot] = p));
    this.number = this.slot;
    this.work = clone(p);
    this.refresh();
  }
}

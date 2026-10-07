/**
 * Base for FrakMC's dialog screens, drawn over the current fractal plot.
 */
import type { App, Screen } from '../../app/app';
import { SLOTS } from '../../state/document';
import { alertBox } from '../alert';
import { Refreshers, box, button, el, label, ob, place } from '../dom';

export abstract class DialogScreen implements Screen {
  abstract readonly name: string;
  protected root!: HTMLDivElement;
  protected r = new Refreshers();

  constructor(protected readonly app: App, protected readonly w: number, protected readonly h: number) {}

  mount(layer: HTMLElement): void {
    this.r = new Refreshers();
    this.root = el('div', 'dlg');
    place(this.root, Math.round((640 - this.w) / 2), Math.round((400 - this.h) / 2), this.w, this.h);
    layer.appendChild(this.root);
    this.build(this.root);
  }

  protected abstract build(root: HTMLDivElement): void;

  unmount(): void {
    this.root?.remove();
  }

  refresh(): void {
    this.r.run();
  }

  onKey?(e: KeyboardEvent): boolean;

  /** GEM-window-style title bar across the top of the dialog. */
  protected titleBar(text: string | (() => string)): void {
    const bar = el('div', 'titlebar');
    const span = el('span');
    bar.appendChild(span);
    this.root.appendChild(bar);
    const upd = () => (span.textContent = typeof text === 'function' ? text() : text);
    upd();
    if (typeof text === 'function') this.r.fn(upd);
  }

  /** A framed group with a small caption breaking its top edge. */
  protected group(x: number, y: number, w: number, h: number, caption = ''): void {
    box(this.root, x, y, w, h);
    if (caption) {
      const g = ob(this.root, 'div', 'group-label', x + 6, y - 6, 0, 12, caption);
      g.style.width = 'auto';
    }
  }

  protected small(x: number, y: number, w: number, h: number, text: string): HTMLDivElement {
    return label(this.root, x, y, w, h, text, 'small');
  }

  /**
   * Eight set-up slots with SAVE and RECALL (Main, Rhythm and Tonality screens): a row of slot
   * buttons, then the two actions. 296 × 24.
   */
  protected setupSlots(x: number, y: number, getSlot: () => number, setSlot: (n: number) => void, onSave: () => void, onRecall: () => void): void {
    const root = this.root;
    this.group(x, y, 300, 34, 'SET-UPS');
    for (let i = 0; i < SLOTS; i++) {
      this.r.add(button(root, x + 6 + 22 * i, y + 7, 22, 22, String(i + 1), () => setSlot(i), { selected: () => getSlot() === i, title: `Slot ${i + 1}` }));
    }
    this.r.add(button(root, x + 192, y + 7, 50, 22, 'SAVE', onSave, { cls: 'shadow', title: 'Store these settings in the selected slot' }));
    this.r.add(button(root, x + 246, y + 7, 50, 22, 'RECALL', onRecall, { cls: 'shadow', title: 'Bring back the settings stored in the selected slot' }));
  }

  protected emptySlot(): Promise<number> {
    return alertBox(1, ['', 'NOTHING STORED IN', 'THAT SLOT YET', ''], ['O.K.']);
  }
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

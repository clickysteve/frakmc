/**
 * SET COORDINATES: drag a note box and a length box per track (Mandelbrot), or click one point
 * per track (Julia). Hold the right button to examine; Backspace undoes; F-keys reuse boxes.
 */
import type { App, Screen } from '../../app/app';
import { juliaC } from '../../fractal/julia';
import { PLOT_H, PLOT_W, pixelCount } from '../../fractal/mandelbrot';
import { buildNoteTable, examineNoteText, lookupTable } from '../../music/pitch';
import { type Box, MAX_TRACKS, type Point } from '../../state/document';
import { alertBox, modalOpen } from '../alert';
import { button, el } from '../dom';

/** Map a pointer event to plot pixel coordinates. */
export function plotXY(stage: HTMLElement, e: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = stage.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) * PLOT_W) / r.width);
  const y = Math.floor(((e.clientY - r.top) * PLOT_H) / r.height);
  return { x: Math.max(0, Math.min(PLOT_W - 1, x)), y: Math.max(0, Math.min(PLOT_H - 1, y)) };
}

export class CoordsScreen implements Screen {
  readonly name = 'coords';
  private boxes: (Box | null)[] = [];
  private points: (Point | null)[] = [];
  /** index into the order of things to set */
  private step = 0;
  private drag: { x: number; y: number; x2: number; y2: number } | null = null;
  private examining = false;
  private mouse = { x: 0, y: 0 };
  private prompt!: HTMLDivElement;
  private fkeys!: HTMLDivElement;
  private stage!: HTMLElement;
  private readonly julia: boolean;
  private readonly tracks: number;
  private cleanup: (() => void)[] = [];

  constructor(private readonly app: App) {
    this.julia = app.doc.main.fractalType === 'julia';
    this.tracks = app.doc.main.numTracks;
  }

  /** number of things to set */
  private get total(): number {
    return this.julia ? this.tracks : this.tracks * 2;
  }

  mount(layer: HTMLElement): void {
    this.stage = layer.parentElement!;
    this.boxes = Array(MAX_TRACKS * 2).fill(null);
    this.points = Array(MAX_TRACKS).fill(null);
    this.prompt = el('div', 'prompt');
    this.prompt.setAttribute('aria-live', 'polite');
    layer.appendChild(this.prompt);
    this.fkeys = el('div', 'fkeys');
    layer.appendChild(this.fkeys);
    const surface = el('div');
    surface.style.cssText = 'position:absolute;inset:0;cursor:crosshair';
    layer.insertBefore(surface, this.prompt);
    const down = (e: PointerEvent) => this.down(e);
    const move = (e: PointerEvent) => this.move(e);
    const up = (e: PointerEvent) => this.up(e);
    surface.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    this.cleanup.push(() => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    });
    this.app.view.setPlot(this.app.counts, this.app.doc.plot.iterations);
    this.refresh();
  }

  unmount(): void {
    for (const f of this.cleanup) f();
    this.app.view.clearOverlay();
  }

  refresh(): void {
    this.renderPrompt();
    this.renderFKeys();
    this.drawOverlay();
  }

  private target(): { track: number; dur: boolean } {
    return this.julia ? { track: this.step, dur: false } : { track: Math.floor(this.step / 2), dur: this.step % 2 === 1 };
  }

  private renderPrompt(): void {
    if (this.step >= this.total) return;
    if (this.examining) {
      this.prompt.textContent = this.examineText();
      return;
    }
    const { track, dur } = this.target();
    this.prompt.textContent = this.julia
      ? `TRACK ${track + 1}: CLICK A POINT   c = ${this.cText()}`
      : `TRACK ${track + 1}: DRAG THE ${dur ? 'LENGTH' : 'NOTE'} BOX   [F${this.step + 1}]`;
  }

  private cText(): string {
    const c = juliaC(this.mouse.x, this.mouse.y, this.app.doc.plot, this.app.doc.options.juliaFromPlot);
    return `${c.re.toFixed(3)}${c.im < 0 ? '-' : '+'}${Math.abs(c.im).toFixed(3)}i`;
  }

  private examineText(): string {
    const { x, y } = this.mouse;
    const { track, dur } = this.target();
    if (this.julia) return `TRACK ${track + 1}  c=${this.cText()}`;
    const doc = this.app.doc;
    const count = pixelCount(doc.plot, x, y);
    const tr = doc.main.tracks[track];
    if (dur) {
      const r = doc.rhythm.tracks[track];
      const i = count === 0 ? 0 : count % r.count;
      return `TRACK ${track + 1}  LENGTH ${r.lengths[i]}   (count ${count})`;
    }
    const tables = doc.main.tracks.map((t) => buildNoteTable(t, doc.main.fractalType));
    return `${examineNoteText(track + 1, lookupTable(tables, track, count), tr)}   (count ${count})`;
  }

  private renderFKeys(): void {
    this.fkeys.replaceChildren();
    try {
      this.fillFKeys();
    } finally {
      for (const b of this.fkeys.querySelectorAll<HTMLElement>('.btn')) {
        b.style.width = '';
        b.style.height = '';
      }
    }
  }

  private fillFKeys(): void {
    if (this.julia) {
      const b = button(this.fkeys, 0, 0, 0, 0, 'UNDO', () => this.undo(), { title: 'Step back (Backspace)' });
      b.el.style.flex = '0 0 80px';
      const c = button(this.fkeys, 0, 0, 0, 0, 'CANCEL', () => void this.cancel(), { title: 'Leave without changing the coordinates (Esc)' });
      c.el.style.flex = '0 0 80px';
      return;
    }
    for (let k = 0; k < this.total; k++) {
      const has = !!this.boxes[k] && k < this.step;
      const b = button(this.fkeys, 0, 0, 0, 0, `F${k + 1}`, () => this.useBox(k), {
        cls: has ? '' : 'empty', title: has ? `Use box F${k + 1} (track ${Math.floor(k / 2) + 1} ${k % 2 ? 'durations' : 'notes'}) for the current box` : `F${k + 1}: not set yet`,
      });
      b.el.classList.toggle('sel', k === this.step);
    }
    const u = button(this.fkeys, 0, 0, 0, 0, 'UNDO', () => this.undo(), { title: 'Step back one box (Backspace)' });
    u.el.style.flex = '0 0 50px';
    const c = button(this.fkeys, 0, 0, 0, 0, 'ESC', () => void this.cancel(), { title: 'Leave without changing the coordinates' });
    c.el.style.flex = '0 0 40px';
  }

  private drawOverlay(): void {
    const v = this.app.view;
    v.clearOverlay();
    if (this.julia) {
      this.points.forEach((p, t) => {
        if (!p || t >= this.step) return;
        v.cursor(p.x, p.y);
        v.tag(p.x + 4, p.y - 2, String(t + 1));
      });
    } else {
      this.boxes.forEach((b, k) => {
        if (!b || k >= this.step) return;
        v.rect(b.x1, b.y1, b.x2, b.y2, k % 2 === 1);
        v.tag(b.x1, b.y1, `${Math.floor(k / 2) + 1}${k % 2 ? 'D' : 'N'}`);
      });
    }
    if (this.drag) v.rect(this.drag.x, this.drag.y, this.drag.x2, this.drag.y2);
  }

  private down(e: PointerEvent): void {
    if (modalOpen) return;
    e.preventDefault();
    this.mouse = plotXY(this.stage, e);
    if (e.button === 2) {
      this.examining = true;
      this.renderPrompt();
      return;
    }
    if (e.button !== 0) return;
    if (this.julia) {
      this.points[this.step] = { ...this.mouse };
      this.advance();
      return;
    }
    this.drag = { x: this.mouse.x, y: this.mouse.y, x2: this.mouse.x, y2: this.mouse.y };
    this.drawOverlay();
  }

  private move(e: PointerEvent): void {
    this.mouse = plotXY(this.stage, e);
    if (this.drag) {
      this.drag.x2 = this.mouse.x;
      this.drag.y2 = this.mouse.y;
      this.drawOverlay();
    }
    if (this.examining || this.julia) this.renderPrompt();
  }

  private up(e: PointerEvent): void {
    if (e.button === 2 && this.examining) {
      this.examining = false;
      this.renderPrompt();
      return;
    }
    if (!this.drag || e.button !== 0) return;
    const d = this.drag;
    this.drag = null;
    this.boxes[this.step] = { x1: Math.min(d.x, d.x2), y1: Math.min(d.y, d.y2), x2: Math.max(d.x, d.x2), y2: Math.max(d.y, d.y2) };
    this.advance();
  }

  private useBox(k: number): void {
    if (this.julia || k >= this.step || !this.boxes[k]) return;
    this.boxes[this.step] = { ...this.boxes[k]! };
    this.advance();
  }

  private undo(): void {
    if (this.step === 0) return;
    this.step--;
    if (this.julia) this.points[this.step] = null;
    else this.boxes[this.step] = null;
    this.refresh();
  }

  private advance(): void {
    this.step++;
    if (this.step >= this.total) {
      this.finish();
      return;
    }
    this.refresh();
  }

  private finish(): void {
    const app = this.app;
    app.edit((d) => {
      if (this.julia) {
        for (let t = 0; t < this.tracks; t++) d.main.juliaPoints[t] = this.points[t];
      } else {
        for (let k = 0; k < this.tracks * 2; k++) d.main.boxes[k] = this.boxes[k];
      }
      d.main.plotName = d.plot.name;
    });
    app.coordsConfirmed = true;
    app.go('main');
  }

  private async cancel(): Promise<void> {
    const r = await alertBox(2, ['', 'LEAVE AND KEEP THE OLD', 'COORDINATES?', ''], ['LEAVE', 'STAY'], 1);
    if (r === 0) this.app.go('main');
  }

  onKey(e: KeyboardEvent): boolean {
    const m = /^F(\d{1,2})$/.exec(e.key);
    if (m) {
      this.useBox(Number(m[1]) - 1);
      return true;
    }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Undo' || e.key.toLowerCase() === 'u') {
      this.undo();
      return true;
    }
    if (e.key === 'Escape') {
      void this.cancel();
      return true;
    }
    return false;
  }
}

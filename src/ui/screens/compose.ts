/**
 * The compose screen: the plot with the boxes being recalculated (Mandelbrot), or six Julia
 * patterns drawn dot by dot (Julia). Everything is drawn when it sounds (scheduler cues).
 */
import type { App, Screen } from '../../app/app';
import { midiNoteName } from '../../music/pitch';
import { MAX_TRACKS } from '../../state/document';
import type { StepCue } from '../../scheduler/sources';
import { el } from '../dom';

const PANE_W = 213, PANE_H = 200;

export class ComposeScreen implements Screen {
  readonly name = 'compose';
  private prompt!: HTMLDivElement;
  private strip!: HTMLDivElement;
  private cursors = new Map<number, { x: number; y: number }>();
  private lastNotes: string[] = Array(MAX_TRACKS).fill('');
  private steps = 0;
  private tonality = { index: 0, scale: 1, transpose: 0 };
  private julia: boolean;

  constructor(private readonly app: App) {
    this.julia = app.doc.main.fractalType === 'julia';
  }

  mount(layer: HTMLElement): void {
    const app = this.app;
    this.prompt = el('div', 'prompt');
    this.strip = el('div', 'prompt');
    this.strip.style.top = 'auto';
    this.strip.style.bottom = '0';
    this.strip.style.right = '0';
    const surface = el('div');
    surface.style.cssText = 'position:absolute;inset:0;cursor:default';
    surface.title = 'Click or press Space to stop';
    surface.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      app.stop();
    });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    layer.append(surface, this.prompt, this.strip);
    if (this.julia) {
      app.view.clear();
      app.view.line(0, PANE_H, 639, PANE_H);
      app.view.line(PANE_W, 0, PANE_W, 399);
      app.view.line(PANE_W * 2 + 1, 0, PANE_W * 2 + 1, 399);
      app.view.clearOverlay();
      for (let t = 0; t < app.doc.main.numTracks; t++) app.view.tag((t % 3) * PANE_W + 4, Math.floor(t / 3) * PANE_H + 30, String(t + 1));
    } else {
      app.view.setPlot(app.counts, app.doc.plot.iterations);
    }
    this.refresh();
  }

  unmount(): void {
    this.app.view.clearOverlay();
    this.app.view.setPlot(this.app.counts, this.app.doc.plot.iterations);
  }

  refresh(): void {
    const sc = this.app.doc.scales[this.tonality.scale - 1];
    const tr = this.tonality.transpose;
    this.prompt.textContent = `${this.tonality.index + 1}: ${sc?.name ?? ''} ${tr < 0 ? '−' : '+'}${Math.abs(tr)}   TEMPO ${this.app.scheduler.tempo}   SPACE STOPS`;
    const n = this.app.doc.main.numTracks;
    this.strip.textContent = this.lastNotes.slice(0, n).map((s, i) => `${i + 1} ${s.padEnd(4)}`).join('  ') + `   STEP ${this.steps}`;
  }

  frame(): void {
    const app = this.app;
    const cues = app.scheduler.takeDueCues();
    if (!cues.length) return;
    const v = app.view;
    for (const c of cues) {
      if (c.kind !== 'step') continue;
      const s = c.data as StepCue;
      this.steps++;
      this.tonality = s.tonality;
      for (const m of s.scans) {
        v.scanPixel(m.x, m.y, m.count);
        this.cursors.set(m.box, { x: m.x, y: m.y });
      }
      for (const d of s.dots) {
        const ox = (d.track % 3) * PANE_W + 106, oy = Math.floor(d.track / 3) * PANE_H;
        v.dot(ox + d.sx, oy + d.sy, app.prefs.display.mode === 'mono' ? 1 : (d.track & 1) + 2);
      }
      for (const nt of s.notes) this.lastNotes[nt.track] = midiNoteName(nt.note);
    }
    if (!this.julia) {
      v.clearOverlay();
      const boxes = app.doc.main.boxes;
      boxes.forEach((b, k) => {
        if (b && Math.floor(k / 2) < app.doc.main.numTracks && !app.doc.main.tracks[Math.floor(k / 2)].mute) v.rect(b.x1, b.y1, b.x2, b.y2, k % 2 === 1);
      });
      for (const p of this.cursors.values()) v.cursor(p.x, p.y);
    }
    this.refresh();
  }

  onKey(e: KeyboardEvent): boolean {
    const app = this.app;
    if (e.key === '+' || e.key === '=' || e.key === '-') {
      const t = Math.max(20, Math.min(300, app.doc.main.tempo + (e.key === '-' ? -1 : 1) * (e.shiftKey ? 10 : 1)));
      app.edit((d) => (d.main.tempo = t));
      app.setLiveTempo(t);
      return true;
    }
    if (e.key === 'Escape' || e.key === 'Enter') {
      app.stop();
      return true;
    }
    return false;
  }
}

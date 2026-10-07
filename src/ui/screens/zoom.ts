/**
 * EXPLORE: zoom into the Mandelbrot set and keep new plots (docs/BEHAVIOUR.md §2.4).
 */
import type { App, Screen } from '../../app/app';
import { ITERATION_CHOICES, type PlotSpec, ZoomTooDeep, zoomWindow } from '../../fractal/mandelbrot';
import { PlotCancelled } from '../../fractal/plotClient';
import { alertBox, modalOpen } from '../alert';
import { el } from '../dom';
import { askName, choosePlot, plotSummary } from './dialogs';
import { plotXY } from './coords';

export class ZoomScreen implements Screen {
  readonly name = 'zoom';
  private spec: PlotSpec;
  private counts: Uint16Array | null = null;
  private prompt!: HTMLDivElement;
  private stage!: HTMLElement;
  private state: 'menu' | 'drag' | 'plotting' | 'view' = 'menu';
  private drag: { x: number; y: number; x2: number; y2: number } | null = null;
  private unsaved = false;
  private cleanup: (() => void)[] = [];
  private alive = true;

  constructor(private readonly app: App) {
    this.spec = { ...app.doc.plot };
  }

  mount(layer: HTMLElement): void {
    this.stage = layer.parentElement!;
    const surface = el('div');
    surface.style.cssText = 'position:absolute;inset:0';
    this.prompt = el('div', 'prompt');
    layer.append(surface, this.prompt);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    surface.addEventListener('pointerdown', (e) => {
      if (modalOpen) return;
      if (this.state === 'drag' && e.button === 0) {
        const p = plotXY(this.stage, e);
        this.drag = { x: p.x, y: p.y, x2: p.x, y2: p.y };
      } else if (this.state === 'view') void this.menu();
    });
    const move = (e: PointerEvent) => {
      if (!this.drag) return;
      const p = plotXY(this.stage, e);
      this.drag.x2 = p.x;
      this.drag.y2 = p.y;
      this.app.view.clearOverlay();
      this.app.view.rect(this.drag.x, this.drag.y, p.x, p.y);
    };
    const up = () => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      void this.zoomTo(Math.min(d.x, d.x2), Math.min(d.y, d.y2), Math.max(d.x, d.x2), Math.max(d.y, d.y2));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.cleanup.push(() => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    });
    this.counts = this.app.plots.cached(this.spec);
    this.app.view.setPlot(this.counts, this.spec.iterations);
    if (!this.counts) void this.render();
    this.refresh();
    void this.menu();
  }

  unmount(): void {
    this.alive = false;
    for (const f of this.cleanup) f();
    this.app.view.clearOverlay();
    this.app.view.setPlot(this.app.counts, this.app.doc.plot.iterations);
  }

  refresh(): void {
    const msg: Record<typeof this.state, string> = {
      menu: `${this.spec.name}  ${plotSummary(this.spec)}`,
      drag: 'DRAG A BOX AROUND THE AREA TO ENLARGE',
      plotting: 'PLOTTING …  ANY KEY CANCELS',
      view: `${this.spec.name}  —  CLICK OR SPACE TO GO ON`,
    };
    this.prompt.textContent = msg[this.state];
  }

  private async render(): Promise<boolean> {
    this.state = 'plotting';
    this.refresh();
    const spec = this.spec;
    const t0 = performance.now();
    try {
      const c = await this.app.plots.plot(spec, (row0, rows, counts) => {
        if (!this.alive) return;
        if (!this.counts || this.counts !== counts) {
          this.counts = counts;
          this.app.view.setPlot(counts, spec.iterations);
        }
        this.app.view.rows(row0, rows);
        this.prompt.textContent = `PLOTTING ${Math.round(((row0 + rows) * 100) / 400)}%  —  ANY KEY CANCELS`;
      });
      this.counts = c;
      if (this.alive) this.app.view.setPlot(c, spec.iterations);
      const secs = (performance.now() - t0) / 1000;
      return secs >= 0;
    } catch (e) {
      if (e instanceof PlotCancelled) return false;
      throw e;
    }
  }

  private async menu(): Promise<void> {
    if (!this.alive) return;
    this.state = 'menu';
    this.refresh();
    const r = await alertBox(2, ['EXPLORE', '', 'LOOK AT A SAVED PLOT,', 'OR ENLARGE PART OF', 'THIS ONE?'], ['BROWSE', 'ZOOM', 'DONE'], 1);
    if (!this.alive) return;
    if (r === 0) {
      const p = await choosePlot(this.app, 'VIEW PLOT');
      if (p) {
        this.spec = { ...p };
        this.counts = this.app.plots.cached(p);
        this.app.view.setPlot(this.counts, p.iterations);
        this.unsaved = false;
        if (!this.counts) await this.render();
      }
      this.state = 'view';
      this.refresh();
    } else if (r === 1) {
      this.state = 'drag';
      this.refresh();
    } else await this.exit();
  }

  private async zoomTo(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    this.app.view.clearOverlay();
    if (x2 - x1 < 2 || y2 - y1 < 2) {
      this.state = 'drag';
      return;
    }
    let w;
    try {
      w = zoomWindow(this.spec, x1, y1, x2, y2);
    } catch (e) {
      if (e instanceof ZoomTooDeep) {
        await alertBox(3, ['', 'CANNOT ENLARGE FURTHER:', 'THE PLOT HAS REACHED THE', 'LIMIT OF ITS PRECISION', ''], ['O.K.'], 0);
        return void this.menu();
      }
      throw e;
    }
    const it = await alertBox(2, ['', 'HOW MUCH DETAIL?', '(ITERATIONS: MORE SHOWS', 'FINER EDGES)', ''], ITERATION_CHOICES.map(String), 0);
    const auto = await alertBox(2, ['', 'NAME AND KEEP THE NEW', 'PLOT WHEN IT IS DONE?', ''], ['LATER', 'YES'], 0);
    let name = nextName(this.app.prefs.plotLibrary.map((p) => p.name));
    if (auto === 1) name = (await askName('NAME FOR THE NEW PLOT', name)) ?? name;
    const previous = this.spec;
    this.spec = { ...w, name, iterations: ITERATION_CHOICES[it] };
    const t0 = performance.now();
    const ok = await this.render();
    if (!ok || !this.alive) {
      this.spec = previous;
      this.counts = this.app.plots.cached(previous);
      this.app.view.setPlot(this.counts, previous.iterations);
      return void this.menu();
    }
    const s = (performance.now() - t0) / 1000;
    await alertBox(1, ['', `PLOTTED IN ${s.toFixed(1)} SECONDS`, `(${this.spec.iterations} ITERATIONS)`, ''], ['O.K.'], 0);
    if (auto === 1) this.app.addToLibrary(this.spec);
    this.unsaved = auto !== 1;
    void this.menu();
  }

  private async exit(): Promise<void> {
    if (this.unsaved) {
      const r = await alertBox(2, ['', `KEEP THE NEW PLOT?`, ''], ['KEEP', 'DISCARD', 'CANCEL'], 0);
      if (r === 2) return void this.menu();
      if (r === 0) {
        const name = await askName('NAME FOR THE NEW PLOT', this.spec.name);
        if (!name) return void this.menu();
        this.spec = { ...this.spec, name };
        this.app.addToLibrary(this.spec);
        this.unsaved = false;
      }
    }
    const known = this.app.prefs.plotLibrary.some((p) => p.name === this.spec.name);
    if (known && this.spec.name !== this.app.doc.plot.name) {
      const use = await alertBox(2, ['', `COMPOSE FROM ${this.spec.name}?`, ''], ['YES', 'NO'], 0);
      if (use === 0) await this.app.setPlot(this.spec);
    }
    this.app.go('startup');
  }

  onKey(e: KeyboardEvent): boolean {
    if (this.state === 'plotting') {
      this.app.plots.cancel();
      return true;
    }
    if (this.state === 'view' && (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape')) {
      void this.menu();
      return true;
    }
    if (this.state === 'drag' && e.key === 'Escape') {
      this.drag = null;
      this.app.view.clearOverlay();
      void this.menu();
      return true;
    }
    return false;
  }
}

function nextName(taken: string[]): string {
  for (let i = 1; i < 1000; i++) {
    const n = `ZOOM${String(i).padStart(2, '0')}`;
    if (!taken.includes(n)) return n;
  }
  return 'ZOOM';
}

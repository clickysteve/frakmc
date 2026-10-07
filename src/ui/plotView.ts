/**
 * Draws plots in the original's pens and palette, plus the overlay (boxes, cursors, rubber
 * band, Julia panes). Display only — no musical logic here.
 */
import { PLOT_H, PLOT_W, VDI_TO_REGISTER_4, plotPen } from '../fractal/mandelbrot';

/** An ST colour: red, green, blue levels 0–7 (the ST's 512-colour palette). */
export type StRgb = [number, number, number];

export interface DisplayPrefs {
  mode: 'mono' | 'colour';
  mono: StRgb[];
  colour: StRgb[];
}

/** ST high default (white paper, black ink) and ST medium default (white, red, green, black). */
export const DEFAULT_DISPLAY: DisplayPrefs = {
  mode: 'mono',
  mono: [[7, 7, 7], [0, 0, 0]],
  colour: [[7, 7, 7], [7, 0, 0], [0, 7, 0], [0, 0, 0]],
};

/** Presets for the Control Panel; "reversed" as Tim Conrardy recommends. */
export const PALETTE_PRESETS: { name: string; mono: StRgb[]; colour: StRgb[] }[] = [
  { name: 'ST DEFAULT', mono: [[7, 7, 7], [0, 0, 0]], colour: [[7, 7, 7], [7, 0, 0], [0, 7, 0], [0, 0, 0]] },
  { name: 'REVERSED', mono: [[0, 0, 0], [7, 7, 7]], colour: [[0, 0, 0], [7, 3, 0], [0, 4, 7], [7, 7, 7]] },
  { name: 'YELLOW', mono: [[0, 0, 0], [7, 7, 2]], colour: [[0, 0, 0], [7, 2, 0], [2, 5, 7], [7, 7, 2]] },
  { name: 'PAPER', mono: [[7, 7, 6], [1, 1, 2]], colour: [[7, 7, 6], [5, 1, 1], [1, 4, 2], [1, 1, 2]] },
];

const lvl = (v: number) => Math.round((Math.max(0, Math.min(7, v)) * 255) / 7);
export const stCss = (c: StRgb): string => `rgb(${lvl(c[0])},${lvl(c[1])},${lvl(c[2])})`;
const stRgba = (c: StRgb): number => (255 << 24) | (lvl(c[2]) << 16) | (lvl(c[1]) << 8) | lvl(c[0]); // little-endian ABGR

export function registers(d: DisplayPrefs): StRgb[] {
  return d.mode === 'mono' ? d.mono : d.colour;
}

/** Paper and ink as GEM uses them: VDI pen 0 and pen 1. */
export function paperInk(d: DisplayPrefs): { paper: StRgb; ink: StRgb } {
  const r = registers(d);
  return d.mode === 'mono' ? { paper: r[0], ink: r[1] } : { paper: r[0], ink: r[3] };
}

export class PlotView {
  readonly ctx: CanvasRenderingContext2D;
  readonly over: CanvasRenderingContext2D;
  private img: ImageData;
  private px: Uint32Array;
  private counts: Uint16Array | null = null;
  private iterations = 72;
  private regs: number[] = [];
  private nColours = 2;
  private display: DisplayPrefs = DEFAULT_DISPLAY;

  constructor(readonly canvas: HTMLCanvasElement, readonly overlay: HTMLCanvasElement) {
    canvas.width = overlay.width = PLOT_W;
    canvas.height = overlay.height = PLOT_H;
    this.ctx = canvas.getContext('2d')!;
    this.over = overlay.getContext('2d')!;
    this.img = this.ctx.createImageData(PLOT_W, PLOT_H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.setDisplay(DEFAULT_DISPLAY);
  }

  setDisplay(d: DisplayPrefs): void {
    this.display = d;
    this.nColours = d.mode === 'mono' ? 2 : 4;
    this.regs = registers(d).map(stRgba);
    this.redraw();
  }

  get inkCss(): string {
    return stCss(paperInk(this.display).ink);
  }

  get paperCss(): string {
    return stCss(paperInk(this.display).paper);
  }

  /** register index for a VDI pen */
  private reg(pen: number): number {
    return this.nColours === 2 ? this.regs[pen] : this.regs[VDI_TO_REGISTER_4[pen]];
  }

  /** Show a plot (counts may still be filling in). */
  setPlot(counts: Uint16Array | null, iterations: number): void {
    this.counts = counts;
    this.iterations = iterations;
    this.redraw();
  }

  /** Repaint rows [row0, row0+rows) from the counts. */
  rows(row0: number, rows: number): void {
    const c = this.counts;
    if (!c) return;
    const n = this.nColours, it = this.iterations;
    for (let i = row0 * PLOT_W, e = Math.min(PLOT_H, row0 + rows) * PLOT_W; i < e; i++) this.px[i] = this.reg(plotPen(c[i], it, n));
    this.ctx.putImageData(this.img, 0, 0, 0, row0, PLOT_W, rows);
  }

  redraw(): void {
    if (!this.counts) {
      this.px.fill(this.regs[0]);
      this.ctx.putImageData(this.img, 0, 0);
      return;
    }
    this.rows(0, PLOT_H);
  }

  /** Blank screen in paper colour (Julia compose). */
  clear(): void {
    this.px.fill(this.regs[0]);
    this.ctx.putImageData(this.img, 0, 0);
  }

  /**
   * A pixel the composer has just recalculated: drawn as the original does,
   * VDI pen (count+1) & mask (only visibly different from the plot in colour mode).
   */
  scanPixel(x: number, y: number, count: number): void {
    const pen = (count + 1) & (this.nColours - 1);
    this.ctx.fillStyle = cssOf(this.reg(pen));
    this.ctx.fillRect(x, y, 1, 1);
  }

  /** A Julia dot in pen `pen`. */
  dot(x: number, y: number, pen: number): void {
    if (x < 0 || y < 0 || x >= PLOT_W || y >= PLOT_H) return;
    this.ctx.fillStyle = cssOf(this.reg(pen % this.nColours));
    this.ctx.fillRect(x, y, 1, 1);
  }

  line(x1: number, y1: number, x2: number, y2: number): void {
    this.ctx.fillStyle = this.inkCss;
    this.ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1) + 1, Math.abs(y2 - y1) + 1);
  }

  clearOverlay(): void {
    this.over.clearRect(0, 0, PLOT_W, PLOT_H);
  }

  /** XOR-looking rectangle: ink outline with a paper inner line, readable on any plot. */
  rect(x1: number, y1: number, x2: number, y2: number, dashed = false): void {
    const o = this.over;
    const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1) + 1, h = Math.abs(y2 - y1) + 1;
    o.save();
    o.lineWidth = 1;
    o.setLineDash(dashed ? [3, 2] : []);
    o.strokeStyle = this.paperCss;
    o.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    o.strokeStyle = this.inkCss;
    o.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    o.restore();
  }

  tag(x: number, y: number, text: string): void {
    const o = this.over;
    o.save();
    o.font = '14px VT323, monospace';
    const w = Math.ceil(o.measureText(text).width) + 4;
    const tx = Math.min(Math.max(0, x), PLOT_W - w), ty = Math.max(0, y - 13);
    o.fillStyle = this.paperCss;
    o.fillRect(tx, ty, w, 13);
    o.strokeStyle = this.inkCss;
    o.strokeRect(tx + 0.5, ty + 0.5, w - 1, 12);
    o.fillStyle = this.inkCss;
    o.textBaseline = 'top';
    o.fillText(text, tx + 2, ty + 1);
    o.restore();
  }

  /** Small cross-hair cursor (where a box is being scanned). */
  cursor(x: number, y: number): void {
    const o = this.over;
    o.fillStyle = this.paperCss;
    o.fillRect(x - 4, y - 1, 9, 3);
    o.fillRect(x - 1, y - 4, 3, 9);
    o.fillStyle = this.inkCss;
    o.fillRect(x - 3, y, 7, 1);
    o.fillRect(x, y - 3, 1, 7);
  }
}

function cssOf(abgr: number): string {
  return `rgb(${abgr & 255},${(abgr >> 8) & 255},${(abgr >> 16) & 255})`;
}

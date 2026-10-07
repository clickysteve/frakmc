/**
 * FrakMC's launcher and the program-change screen.
 */
import type { App } from '../../app/app';
import { fmcCount } from '../../fractal/mandelbrot';
import { toQ27 } from '../../fractal/fixed';
import { LIMITS } from '../../state/document';
import { button, cell, el, label, ob } from '../dom';
import { about } from './dialogs';
import { DialogScreen } from './base';

/** A small Mandelbrot detail computed by FrakMC for the launcher (not a stored image). */
function drawEmblem(canvas: HTMLCanvasElement, ink: string, paper: string): void {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = ink;
  // the "seahorse valley" between the main cardioid and the period-2 bulb
  const x0 = -0.7495, x1 = -0.7385, y0 = 0.0955, y1 = 0.1035;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const c = fmcCount(toQ27(x0 + ((x1 - x0) * px) / w), toQ27(y0 + ((y1 - y0) * py) / h), 288);
      if (c === 0 || (c >> 2) % 2 === 1) ctx.fillRect(px, py, 1, 1);
    }
  }
}

export class StartupScreen extends DialogScreen {
  readonly name = 'startup';

  constructor(app: App) {
    super(app, 392, 268);
  }

  protected build(root: HTMLDivElement): void {
    const app = this.app;
    this.titleBar('FRAKMC');
    const emblem = el('canvas');
    emblem.width = 132;
    emblem.height = 96;
    emblem.setAttribute('aria-hidden', 'true');
    const holder = ob(root, 'div', 'box', 14, 32, 134, 98);
    holder.appendChild(emblem);
    emblem.style.cssText = 'position:static;width:132px;height:96px;image-rendering:pixelated';
    let drawn = '';
    this.r.fn(() => {
      const key = app.view.inkCss + app.view.paperCss;
      if (key !== drawn) drawEmblem(emblem, app.view.inkCss, app.view.paperCss);
      drawn = key;
    });
    label(root, 160, 36, 220, 56, 'FrakMC', 'wordmark');
    this.small(162, 92, 220, 12, 'FRACTAL MUSIC COMPOSITION');
    this.small(162, 106, 220, 24, 'informed by Hugh McDowell\'s\nFractal Music Composer 2 (1993)');

    const tiles: [string, string, string, () => void][] = [
      ['COMPOSE', 'plot → music', 'The composer: turn the plot into music', () => app.go('main')],
      ['EXPLORE', 'zoom the set', 'Zoom into the Mandelbrot set and make new plots', () => app.go('zoom')],
      ['MIDI FILES', 'play, convert', 'Analyse, play, filter and convert MIDI files', () => app.go('player')],
    ];
    tiles.forEach(([text, sub, title, go], i) => {
      const x = 14 + i * 124;
      this.r.add(button(root, x, 144, 116, 40, text, go, { cls: `shadow${i === 0 ? ' default' : ''}`, title }));
      this.small(x, 188, 116, 12, sub).style.justifyContent = 'center';
    });

    this.group(14, 216, 110, 40, 'DISPLAY');
    for (const [i, mode, text] of [[0, 'mono', 'MONO'], [1, 'colour', 'COLOUR']] as const) {
      this.r.add(button(root, 20 + i * 50, 226, i ? 50 : 46, 22, text, () => {
        app.prefs.display.mode = mode;
        app.applyDisplay();
        app.savePrefs();
        app.changed(false);
      }, { selected: () => app.prefs.display.mode === mode, title: mode === 'mono' ? 'Two colours (ST high resolution look)' : 'Four colours (ST medium resolution look)' }));
    }
    this.group(132, 216, 104, 40, 'MOUSE L/R');
    for (const [i, swap, text] of [[0, false, '− +'], [1, true, '+ −']] as const) {
      this.r.add(button(root, 138 + i * 46, 226, 46, 22, text, () => {
        app.prefs.swapButtons = swap;
        app.savePrefs();
        app.changed(false);
      }, { selected: () => app.prefs.swapButtons === swap, title: swap ? 'Left button increases, right decreases' : 'Left button decreases, right increases' }));
    }
    this.r.add(button(root, 248, 222, 62, 28, 'ABOUT', () => void about(), { cls: 'shadow' }));
    this.r.add(button(root, 316, 222, 62, 28, 'HELP', () => window.open('docs/quick-start.html', '_blank', 'noopener'), { cls: 'shadow', title: 'Open the Quick Start guide' }));
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key === 'Enter') {
      this.app.go('main');
      return true;
    }
    return false;
  }
}

export class PatchScreen extends DialogScreen {
  readonly name = 'patch';

  constructor(app: App) {
    super(app, 260, 170);
  }

  protected build(root: HTMLDivElement): void {
    const app = this.app;
    this.titleBar('PROGRAM CHANGE');
    label(root, 20, 38, 150, 22, 'CHANNEL');
    this.r.add(cell(root, 186, 36, 52, 24, {
      get: () => app.doc.patch.chan, set: (v) => app.edit((d) => (d.patch.chan = v)), min: LIMITS.chan[0], max: LIMITS.chan[1], label: 'Channel to send on',
    }));
    label(root, 20, 72, 150, 22, 'PROGRAM (1-128)');
    this.r.add(cell(root, 186, 70, 52, 24, {
      get: () => app.doc.patch.program, set: (v) => app.edit((d) => (d.patch.program = v)), min: LIMITS.program[0], max: LIMITS.program[1], label: 'Program number 1-128',
    }));
    this.small(20, 104, 160, 24, 'sent now; not stored in\nthe MIDI file');
    this.r.add(button(root, 186, 104, 52, 24, 'SEND', () => app.sendPatch(), { cls: 'shadow', title: 'Send a program change now (status C0+channel, data = program − 1)' }));
    this.r.add(button(root, 90, 136, 80, 24, 'CLOSE', () => app.go('main'), { cls: 'exit' }));
  }
}

/**
 * Modal dialogs: plot library, name entry, document open, colours, About, and importing
 * original FMC2 data files.
 */
import type { App } from '../../app/app';
import { fromQ27 } from '../../fractal/fixed';
import { FULLSET, type PlotSpec } from '../../fractal/mandelbrot';
import {
  decodeCompset, decodeDmp, decodeRhythms, decodeScaleSet, decodeTonalities, fmcFileKind,
} from '../../persistence/fmcFiles';
import { alertBox, modal } from '../alert';
import { button, cell, el, label, ob, pickFile } from '../dom';
import { PALETTE_PRESETS, type StRgb, stCss } from '../plotView';

const fmt = (v: number, d = 4) => (v >= 0 ? '+' : '') + v.toFixed(d);

export function plotSummary(p: PlotSpec): string {
  const x0 = fromQ27(p.x0), y0 = fromQ27(p.y0);
  const x1 = x0 + fromQ27(p.dx) * 640, y1 = y0 + fromQ27(p.dy) * 400;
  return `${fmt(x0)}…${fmt(x1)}  ${fmt(y0)}…${fmt(y1)}i  ${p.iterations} IT.`;
}

/** Pick a plot from the library (the original's file selector). */
export function choosePlot(app: App, title = 'CHOOSE A PLOT'): Promise<PlotSpec | null> {
  let chosen: PlotSpec | null = null;
  return modal(470, 300, ({ root, close }) => {
    const bar = el('div', 'titlebar');
    bar.appendChild(el('span', '', title));
    root.appendChild(bar);
    label(root, 12, 36, 446, 16, 'NAME         WINDOW (REAL / IMAGINARY)', 'small');
    const list = ob(root, 'div', 'box', 10, 54, 450, 196);
    list.style.overflow = 'auto';
    list.setAttribute('role', 'listbox');
    let sel = Math.max(0, app.prefs.plotLibrary.findIndex((p) => p.name === app.doc.plot.name));
    const render = () => {
      list.replaceChildren();
      app.prefs.plotLibrary.forEach((p, i) => {
        const row = el('div', 'btn', `${p.name.padEnd(12)} ${plotSummary(p)}`);
        row.style.cssText = 'position:static;justify-content:flex-start;padding:0 4px;height:20px;border:none;font-size:15px';
        row.classList.toggle('sel', i === sel);
        row.setAttribute('role', 'option');
        row.tabIndex = 0;
        row.addEventListener('click', () => {
          sel = i;
          render();
        });
        row.addEventListener('dblclick', () => {
          chosen = app.prefs.plotLibrary[i];
          close();
        });
        list.appendChild(row);
      });
    };
    render();
    button(root, 10, 262, 110, 26, 'IMPORT .DMP', async () => {
      const f = await pickFile('.dmp,.DMP');
      if (!f) return;
      try {
        const dmp = decodeDmp(new Uint8Array(await f.arrayBuffer()), f.name);
        app.addToLibrary(dmp.spec);
        sel = app.prefs.plotLibrary.findIndex((p) => p.name === dmp.spec.name);
        render();
      } catch (e) {
        await alertBox(3, ['', String((e as Error).message).toUpperCase(), ''], ['O.K.']);
      }
    }, { cls: 'shadow', title: 'Import a .DMP plot file from your own copy of the original FMC2' });
    button(root, 130, 262, 90, 26, 'DELETE', async () => {
      const p = app.prefs.plotLibrary[sel];
      if (!p || p.name === FULLSET.name) return;
      if ((await alertBox(2, ['', `DELETE ${p.name} ?`, ''], ['DELETE', 'CANCEL'], 1)) !== 0) return;
      app.prefs.plotLibrary.splice(sel, 1);
      app.savePrefs();
      sel = 0;
      render();
    }, { cls: 'shadow' });
    button(root, 260, 262, 90, 26, 'CANCEL', () => close(), { cls: 'shadow' });
    button(root, 360, 262, 100, 26, 'O.K.', () => {
      chosen = app.prefs.plotLibrary[sel] ?? null;
      close();
    }, { cls: 'exit' });
  }).then(async () => {
    if (chosen && title === 'CHOOSE A PLOT') await app.setPlot(chosen);
    return chosen;
  });
}

/** Ask for a name (upper case, like GEM's file selector). */
export function askName(title: string, initial: string, max = 8): Promise<string | null> {
  let result: string | null = null;
  return modal(320, 120, ({ root, close }) => {
    label(root, 12, 10, 296, 20, title, 'txt');
    const input = el('input', 'name-input');
    input.value = initial;
    input.maxLength = max;
    input.setAttribute('aria-label', title);
    const holder = ob(root, 'div', '', 60, 40, 200, 24);
    input.style.width = '200px';
    holder.appendChild(input);
    const ok = () => {
      const v = input.value.toUpperCase().replace(/[^A-Z0-9_\- ]/g, '').trim();
      if (!v) return;
      result = v;
      close();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') ok();
      if (e.key === 'Escape') close();
    });
    button(root, 60, 80, 90, 26, 'CANCEL', () => close(), { cls: 'shadow' });
    button(root, 170, 80, 90, 26, 'O.K.', ok, { cls: 'exit' });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }).then(() => result);
}

/** Open a document saved in this browser. */
export function openDocument(app: App): Promise<void> {
  return modal(400, 280, ({ root, close }) => {
    label(root, 12, 8, 376, 22, 'OPEN COMPOSITION', 'txt');
    const list = ob(root, 'div', 'box', 10, 34, 380, 196);
    list.style.overflow = 'auto';
    let sel = 0;
    const render = () => {
      list.replaceChildren();
      const docs = app.store.list();
      if (!docs.length) list.appendChild(el('div', 'label', '  (nothing saved in this browser yet)'));
      docs.forEach((d, i) => {
        const row = el('div', 'btn', `${d.name.padEnd(24)} ${new Date(d.savedAt).toLocaleDateString()}`);
        row.style.cssText = 'position:static;justify-content:flex-start;padding:0 4px;height:20px;border:none';
        row.classList.toggle('sel', i === sel);
        row.addEventListener('click', () => {
          sel = i;
          render();
        });
        row.addEventListener('dblclick', () => void open(i));
        list.appendChild(row);
      });
    };
    const open = async (i: number) => {
      const d = app.store.list()[i];
      if (!d) return;
      close();
      try {
        await app.loadDocument(app.store.load(d.name));
      } catch (e) {
        await alertBox(3, ['', String((e as Error).message).toUpperCase(), ''], ['O.K.']);
      }
    };
    render();
    button(root, 10, 242, 90, 26, 'DELETE', async () => {
      const d = app.store.list()[sel];
      if (!d) return;
      if ((await alertBox(2, ['', `DELETE ${d.name} ?`, ''], ['DELETE', 'CANCEL'], 1)) === 0) {
        app.store.remove(d.name);
        sel = 0;
        render();
      }
    }, { cls: 'shadow' });
    button(root, 190, 242, 90, 26, 'CANCEL', () => close(), { cls: 'shadow' });
    button(root, 290, 242, 100, 26, 'OPEN', () => void open(sel), { cls: 'exit' });
  });
}

/** The Control Panel: ST palette (0–7 per gun), like CONTROL.ACC. */
export function controlPanel(app: App): Promise<void> {
  return modal(430, 290, ({ root, close }) => {
    const d = () => app.prefs.display;
    const regs = (): StRgb[] => (d().mode === 'mono' ? d().mono : d().colour);
    const refreshers: (() => void)[] = [];
    const apply = () => {
      app.applyDisplay();
      app.savePrefs();
      refreshers.forEach((f) => f());
    };
    label(root, 12, 8, 406, 22, 'COLOURS', 'txt');
    for (const [i, mode, text] of [[0, 'mono', 'MONO (HIGH)'], [1, 'colour', '4 COLOURS (MEDIUM)']] as const) {
      const b = button(root, 20 + i * 200, 36, 190, 24, text, () => {
        d().mode = mode;
        apply();
      }, { selected: () => d().mode === mode });
      refreshers.push(b.refresh);
    }
    label(root, 20, 70, 400, 16, 'COLOUR   RED GREEN BLUE   SAMPLE', 'small');
    for (let r = 0; r < 4; r++) {
      const y = 88 + r * 30;
      const hidden = () => d().mode === 'mono' && r > 1;
      const name = label(root, 20, y, 70, 24, `  ${r}`);
      refreshers.push(() => (name.style.visibility = hidden() ? 'hidden' : ''));
      for (let g = 0; g < 3; g++) {
        const c = cell(root, 100 + g * 46, y, 36, 24, {
          get: () => regs()[r]?.[g] ?? 0, set: (v) => {
            regs()[r][g] = v;
            apply();
          }, min: 0, max: 7, label: `Colour ${r} ${['red', 'green', 'blue'][g]}`,
          disabled: hidden,
        });
        refreshers.push(c.refresh);
        refreshers.push(() => (c.el.style.visibility = hidden() ? 'hidden' : ''));
      }
      const sw = ob(root, 'div', 'box', 250, y, 60, 24);
      refreshers.push(() => {
        sw.style.visibility = hidden() ? 'hidden' : '';
        if (regs()[r]) sw.style.background = stCss(regs()[r]);
      });
    }
    label(root, 320, 88, 100, 40, 'LEFT −\nRIGHT +', 'small');
    PALETTE_PRESETS.forEach((p, i) => {
      button(root, 20 + i * 100, 214, 92, 22, p.name, () => {
        d().mono = p.mono.map((c) => [...c] as StRgb);
        d().colour = p.colour.map((c) => [...c] as StRgb);
        apply();
      }, { cls: 'shadow' });
    });
    button(root, 330, 252, 90, 26, 'O.K.', () => close(), { cls: 'exit' });
    refreshers.forEach((f) => f());
  });
}

export function about(): Promise<void> {
  return modal(520, 336, ({ root, close }) => {
    const bar = el('div', 'titlebar');
    bar.appendChild(el('span', '', 'ABOUT FRAKMC'));
    root.appendChild(bar);
    const text = [
      'FrakMC is an independent browser-based fractal music',
      'composition project inspired by and informed by Hugh',
      'McDowell\'s Fractal Music Composer 2 for the Atari ST.',
      '',
      'It is independently implemented and is not an official',
      'port or continuation of Fractal Music Composer, and is',
      'not affiliated with or endorsed by Hugh McDowell or any',
      'publisher or distributor of FMC/FMC2. The original',
      'software, documentation and other historical material',
      'are not distributed with FrakMC.',
      '',
      'Each track reads a box of the Mandelbrot plot, one pixel',
      'per note; how fast each pixel escapes picks its pitch,',
      'length and loudness through the track\'s range, the scale',
      'patterns, the tonality map and the rhythm map.',
      '',
      'With thanks and respect to Hugh McDowell (1953-2018),',
      'whose program and ideas this project studies.',
    ];
    label(root, 22, 30, 480, 270, text.join('\n'), '').style.alignItems = 'flex-start';
    button(root, 210, 298, 100, 28, 'O.K.', () => close(), { cls: 'exit' });
  });
}

/** Import a file: a .frakmc.json document, or an original FMC2 data file (plot, scales, set-ups). */
export async function importFile(app: App): Promise<void> {
  const f = await pickFile('.json,.dmp,.sca,.rec,.DMP,.SCA,.REC');
  if (!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  try {
    if (/\.json$/i.test(f.name)) {
      await app.importJson(new TextDecoder().decode(bytes));
      return;
    }
    const kind = fmcFileKind(f.name, bytes.length);
    if (kind === 'plot') {
      const dmp = decodeDmp(bytes, f.name);
      app.addToLibrary(dmp.spec);
      await app.setPlot(dmp.spec);
    } else if (kind === 'scales') {
      const scales = decodeScaleSet(bytes);
      app.edit((d) => {
        d.scales = scales;
        d.scaleSetName = f.name.replace(/\..*$/, '').toUpperCase().slice(0, 8);
      });
    } else if (kind === 'compset') {
      const s = decodeCompset(bytes);
      app.edit((d) => (d.banks.main = s));
    } else if (kind === 'rhythms') {
      const s = decodeRhythms(bytes);
      app.edit((d) => (d.banks.rhythm = s));
    } else if (kind === 'tonality') {
      const s = decodeTonalities(bytes);
      app.edit((d) => (d.banks.tonality = s));
    } else throw new Error('Unknown file type');
    const where = { plot: 'PLOT LIBRARY', scales: 'SCALE PATTERNS', compset: 'MAIN SAVE/RECALL SLOTS', rhythms: 'RHYTHM SLOTS', tonality: 'TONALITY SLOTS' }[kind];
    await alertBox(1, ['', `${f.name.toUpperCase()} LOADED`, `INTO THE ${where}`, ''], ['O.K.']);
  } catch (e) {
    await alertBox(3, ['', String((e as Error).message).toUpperCase(), ''], ['O.K.']);
  }
}

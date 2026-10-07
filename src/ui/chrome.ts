/**
 * Everything around the ST screen: a GEM-style menu bar (modern functions live here so the
 * original screens stay as they were), the always-visible PANIC button, the MIDI monitor panel
 * and the status line.
 */
import type { App } from '../app/app';
import { describe } from '../midi/monitor';
import { POWER_ON_STATE } from '../fractal/drand48';
import { alertBox, modalOpen } from './alert';
import { el } from './dom';
import { about, askName, controlPanel, importFile, openDocument } from './screens/dialogs';

interface MenuItem {
  label: string | (() => string);
  action?: () => void;
  checked?: () => boolean;
  disabled?: () => boolean;
  sep?: boolean;
}

export function buildMenuBar(app: App, bar: HTMLElement): void {
  const menus: [string, () => MenuItem[]][] = [
    ['Desk', () => [
      { label: 'About FrakMC…', action: () => void about() },
      { sep: true, label: '' },
      { label: 'Colours…', action: () => void controlPanel(app) },
    ]],
    ['File', () => [
      { label: 'New composition', action: () => void confirmThen(app, () => app.newDocument()) },
      { label: 'Open…', action: () => void openDocument(app) },
      { label: 'Save', action: () => app.saveNamed(app.doc.name) },
      { label: 'Save as…', action: () => void askName('SAVE COMPOSITION AS', app.doc.name, 24).then((n) => n && app.saveNamed(n)) },
      { sep: true, label: '' },
      { label: 'Export document (.frakmc.json)', action: () => app.exportJson() },
      { label: 'Import document, or original FMC2 data file…', action: () => void importFile(app) },
      { sep: true, label: '' },
      { label: 'Save MIDI-file', action: () => app.saveMidiFile(), disabled: () => !app.recording },
      { label: 'Render 64 bars to memory (no waiting)', action: () => renderOffline(app), disabled: () => !app.composeEnabled || app.scheduler.playing },
    ]],
    ['MIDI', () => {
      const outs = app.midi.outputs();
      const items: MenuItem[] = [];
      if (app.midi.status === 'unsupported') items.push({ label: 'Web MIDI is not available in this browser', disabled: () => true });
      else if (app.midi.status === 'denied') items.push({ label: 'MIDI access was refused', disabled: () => true });
      else if (app.midi.status === 'pending') items.push({ label: 'Waiting for MIDI access…', disabled: () => true });
      items.push({ label: 'No MIDI output', action: () => app.selectOutput(''), checked: () => !app.prefs.midiOut });
      for (const o of outs) {
        items.push({ label: `${o.name}${o.connected ? '' : ' (disconnected)'}`, action: () => app.selectOutput(o.id), checked: () => app.prefs.midiOut === o.id, disabled: () => !o.connected });
      }
      items.push({ sep: true, label: '' });
      items.push({ label: 'Internal monitor', checked: () => app.prefs.monitorOn, action: () => {
        app.prefs.monitorOn = !app.prefs.monitorOn;
        app.applyMonitor();
        app.savePrefs();
      } });
      items.push({ label: 'Show monitor panel', checked: () => app.prefs.showMonitor, action: () => {
        app.prefs.showMonitor = !app.prefs.showMonitor;
        app.savePrefs();
      } });
      items.push({ sep: true, label: '' });
      items.push({ label: 'PANIC — all notes off', action: () => app.panic() });
      return items;
    }],
    ['Options', () => [
      { label: 'Mouse: left button increases', checked: () => app.prefs.swapButtons, action: () => {
        app.prefs.swapButtons = !app.prefs.swapButtons;
        app.savePrefs();
      } },
      { label: '4-colour display (ST medium)', checked: () => app.prefs.display.mode === 'colour', action: () => {
        app.prefs.display.mode = app.prefs.display.mode === 'mono' ? 'colour' : 'mono';
        app.applyDisplay();
        app.savePrefs();
      } },
      { sep: true, label: '' },
      { label: 'Julia c from plot coordinates', checked: () => app.doc.options.juliaFromPlot, action: () => app.edit((d) => (d.options.juliaFromPlot = !d.options.juliaFromPlot)) },
      { label: 'Write tempo into MIDI files', checked: () => app.doc.options.writeTempo, action: () => app.edit((d) => (d.options.writeTempo = !d.options.writeTempo)) },
      { label: 'Reset Julia random generator', disabled: () => app.doc.juliaRng === POWER_ON_STATE, action: () => app.edit((d) => (d.juliaRng = POWER_ON_STATE)) },
    ]],
    ['Help', () => [
      { label: 'Quick Start guide', action: () => window.open('docs/quick-start.html', '_blank', 'noopener') },
      { label: 'Keys…', action: () => void keysHelp() },
      { label: 'About FrakMC…', action: () => void about() },
    ]],
  ];

  let open: { title: HTMLElement; menu: HTMLElement } | null = null;
  const close = () => {
    if (!open) return;
    open.title.classList.remove('open');
    open.menu.remove();
    open = null;
  };
  const show = (title: HTMLElement, items: () => MenuItem[]) => {
    close();
    const menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');
    for (const it of items()) {
      if (it.sep) {
        menu.appendChild(el('div', 'sep'));
        continue;
      }
      const row = el('div', 'item', typeof it.label === 'function' ? it.label() : it.label);
      row.setAttribute('role', 'menuitem');
      row.tabIndex = -1;
      if (it.checked?.()) row.classList.add('checked');
      const dis = it.disabled?.() ?? false;
      if (dis) row.classList.add('disabled');
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dis) return;
        close();
        it.action?.();
      });
      menu.appendChild(row);
    }
    menu.style.left = `${title.offsetLeft}px`;
    bar.appendChild(menu);
    title.classList.add('open');
    open = { title, menu };
  };
  for (const [name, items] of menus) {
    const t = el('div', 'title', name);
    t.setAttribute('role', 'button');
    t.tabIndex = 0;
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      if (open?.title === t) close();
      else show(t, items);
    });
    t.addEventListener('mouseenter', () => {
      if (open && open.title !== t) show(t, items);
    });
    t.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        show(t, items);
        (open?.menu.querySelector('.item:not(.disabled)') as HTMLElement | null)?.focus();
      }
    });
    bar.appendChild(t);
  }
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...open.menu.querySelectorAll<HTMLElement>('.item:not(.disabled)')];
      const i = items.indexOf(document.activeElement as HTMLElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      e.preventDefault();
    } else if (e.key === 'Enter' && open.menu.contains(document.activeElement)) (document.activeElement as HTMLElement).click();
    else return;
    e.stopPropagation();
  }, true);

  bar.appendChild(el('div', 'spacer'));
  const status = el('div', 'status');
  bar.appendChild(status);
  const panic = el('button', 'panic', 'PANIC');
  panic.type = 'button';
  panic.title = 'Stop and send All Notes Off / All Sound Off on every channel';
  panic.addEventListener('click', () => app.panic());
  bar.appendChild(panic);
  const upd = () => {
    status.textContent = `MIDI OUT: ${app.outputName}${app.prefs.monitorOn ? ' + MONITOR' : ''}`;
  };
  app.onChange(upd);
  app.midi.onChange(upd);
  upd();
}

async function confirmThen(app: App, f: () => Promise<void>): Promise<void> {
  if (app.dirty) {
    const r = await alertBox(2, ['', 'START A NEW COMPOSITION ?', '(the current one stays in the', ' browser until replaced)', ''], ['NEW', 'CANCEL'], 1);
    if (r !== 0) return;
  }
  await f();
}

function renderOffline(app: App): void {
  const n = app.renderOffline(64 * 4);
  void alertBox(1, ['', `${n} EVENTS COMPOSED`, 'REPLAY OR SAVE MIDI-FILE', ''], ['O.K.']);
}

function keysHelp(): Promise<number> {
  return alertBox(1, [
    'LEFT / RIGHT CLICK    value − / +',
    'WHEEL, ARROW KEYS     value − / +',
    'RETURN                compose / confirm',
    'SPACE                 stop',
    '+ / −  while playing  tempo',
    'F1-F12                reuse a box',
    'BACKSPACE / U         undo a box',
    'HOLD RIGHT ON PLOT    examine a point',
    'ESC                   back / cancel',
  ], ['O.K.']);
}

export function buildMonitor(app: App, panel: HTMLElement): () => void {
  panel.appendChild(el('h2', '', 'MIDI MONITOR'));
  const lamps = el('div', 'lamps');
  const lampEls = Array.from({ length: 16 }, (_, i) => {
    const l = el('div', 'lamp', String(i + 1));
    l.title = `Channel ${i + 1}`;
    lamps.appendChild(l);
    return l;
  });
  panel.appendChild(lamps);
  const roll = el('canvas');
  roll.width = 270;
  roll.height = 150;
  roll.setAttribute('aria-label', 'Piano roll of the last seconds of MIDI output');
  panel.appendChild(roll);
  const log = el('div', 'log');
  log.setAttribute('aria-live', 'off');
  panel.appendChild(log);
  const foot = el('div', 'foot');
  panel.appendChild(foot);
  const ctx = roll.getContext('2d')!;
  const notes: { ch: number; n: number; t0: number; t1: number | null }[] = [];
  let lastLogTotal = -1;
  return () => {
    panel.hidden = !app.prefs.showMonitor;
    const m = app.monitor;
    const now = performance.now();
    for (const e of m.update()) {
      const [s, a, b] = e.bytes;
      const st = s & 0xf0;
      if (st === 0x90 && b > 0) notes.push({ ch: s & 15, n: a, t0: e.at, t1: null });
      else if (st === 0x80 || st === 0x90) {
        const open = notes.find((x) => x.ch === (s & 15) && x.n === a && x.t1 === null);
        if (open) open.t1 = e.at;
      } else if (st === 0xb0 && (a === 120 || a === 123)) for (const x of notes) if (x.t1 === null && x.ch === (s & 15)) x.t1 = e.at;
    }
    if (notes.length > 2000) notes.splice(0, notes.length - 2000);
    if (panel.hidden) return;
    lampEls.forEach((l, i) => l.classList.toggle('on', m.active[i].size > 0 || now - m.lastOn[i] < 80));
    // piano roll: last 6 s, notes 24–108
    const W = roll.width, H = roll.height, span = 6000;
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink');
    const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ink;
    for (let i = notes.length - 1; i >= 0; i--) {
      const x = notes[i];
      if (x.t1 !== null && now - x.t1 > span) {
        notes.splice(i, 1);
        continue;
      }
      const x0 = W - ((now - x.t0) / span) * W;
      const x1 = x.t1 === null ? W : W - ((now - x.t1) / span) * W;
      const y = H - ((x.n - 24) / 84) * H;
      ctx.globalAlpha = 0.45 + (x.ch % 4) * 0.18;
      ctx.fillRect(Math.max(0, x0), Math.round(y), Math.max(1, x1 - x0), 2);
    }
    ctx.globalAlpha = 1;
    if (m.total !== lastLogTotal) {
      lastLogTotal = m.total;
      log.textContent = m.log.slice(-40).filter((e) => e.bytes[0] !== 0xf8).map((e) => describe(e.bytes)).reverse().join('\n');
    }
    foot.textContent = `${m.total} msgs  sounding ${m.active.reduce((s, x) => s + x.size, 0)}`;
  };
}

export function buildStatus(app: App, bar: HTMLElement): () => void {
  const left = el('span', 'grow');
  const right = el('span');
  bar.append(left, right);
  return () => {
    const d = app.doc;
    const playing = app.scheduler.playing;
    const what = { idle: 'READY', composing: 'COMPOSING', replaying: 'REPLAYING', player: 'PLAYING FILE' }[app.mode];
    const rec = app.recording ? `${app.recording.events.length} events in memory` : 'no composition in memory';
    const plot = app.plotRows < 400 ? `plotting ${Math.round(app.plotRows / 4)}%` : `${d.plot.name} ${d.plot.iterations} it.`;
    left.textContent = `${d.name}${app.dirty ? '*' : ''} — ${what}${playing ? ` tick ${Math.floor(app.scheduler.currentTick)}` : ''} — ${rec} — ${plot}${app.lastError ? ` — ${app.lastError}` : ''}`;
    right.textContent = modalOpen ? '' : 'Left −  Right +  ·  Space stops';
  };
}

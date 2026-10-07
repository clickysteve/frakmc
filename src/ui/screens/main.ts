/**
 * The COMPOSER screen: the six tracks and everything that shapes a composition.
 * Layout is FrakMC's own; the controls are the FMC2 model's (docs/BEHAVIOUR.md §3–§10).
 */
import type { App } from '../../app/app';
import { LIMITS, MAX_TRACKS, SAME_NOTE_MODES, clone, inRange } from '../../state/document';
import { alertBox } from '../alert';
import { button, cell, el, label, ob } from '../dom';
import { choosePlot } from './dialogs';
import { DialogScreen, NOTE_NAMES } from './base';

const ROW0 = 76;
const ROW_H = 23;
const SAME_NOTE_TITLES = {
  REP: 'REP: a repeated note is struck again',
  TIE: 'TIE: a repeated note is held on',
  RST: 'RST: a repeated note becomes a rest',
};

export class MainScreen extends DialogScreen {
  readonly name = 'main';

  constructor(app: App) {
    super(app, 624, 384);
  }

  protected build(root: HTMLDivElement): void {
    const app = this.app;
    const d = () => app.doc;
    const m = () => app.doc.main;
    const edit = app.edit.bind(app);
    const playing = () => app.scheduler.playing;
    const shown = (t: number) => t < m().numTracks;

    this.titleBar(() => `COMPOSER — ${d().name}`);

    // ---- top strip: tracks, plot, fractal type
    label(root, 10, 28, 60, 20, 'TRACKS');
    this.r.add(cell(root, 66, 25, 30, 26, {
      get: () => m().numTracks, set: (v) => edit((x) => (x.main.numTracks = v)), ...range(LIMITS.tracks), cls: 'thick', label: 'Number of tracks',
      title: 'How many tracks are used (left −, right +)',
    }));
    label(root, 116, 28, 40, 20, 'PLOT');
    this.r.add(button(root, 152, 25, 150, 26, '', () => void choosePlot(app), {
      cls: 'shadow', text: () => d().plot.name, title: 'Choose the fractal plot the composer reads',
    }));
    label(root, 318, 28, 40, 20, 'TYPE');
    for (const [x, type, text] of [[356, 'mandelbrot', 'MANDELBROT'], [454, 'julia', 'JULIA']] as const) {
      this.r.add(button(root, x, 25, type === 'julia' ? 70 : 94, 26, text, () => {
        if (m().fractalType === type) return;
        edit((xx) => (xx.main.fractalType = type));
        app.coordsConfirmed = false;
        if (type === 'julia') void alertBox(1, ['', 'JULIA MODE: RHYTHMS PLAY', 'IN SEQUENCE (SEQ). CHOOSE', 'ONE POINT PER TRACK WITH', 'SET COORDINATES.', ''], ['O.K.']);
      }, { selected: () => m().fractalType === type, title: type === 'julia' ? 'Julia: one point per track; patterns drawn while composing' : 'Mandelbrot: a note box and a length box per track' }));
    }
    this.r.add(button(root, 534, 25, 80, 26, 'PROGRAM', () => app.go('patch'), { cls: 'shadow', title: 'Send a program (patch) change' }));

    // ---- the track table
    this.group(4, 54, 428, ROW_H * MAX_TRACKS + 28);
    const head = (x: number, w: number, text: string) => this.small(x, 58, w, 14, text).style.justifyContent = 'center';
    head(8, 18, '#');
    head(28, 20, 'M');
    head(52, 30, 'CH');
    this.small(86, 55, 58, 10, 'LOW').style.justifyContent = 'center';
    this.small(148, 55, 58, 10, 'HIGH').style.justifyContent = 'center';
    head(210, 26, 'S.O');
    head(242, 102, 'SAME NOTE');
    head(348, 20, 'D');
    head(372, 52, 'LISTEN');
    this.small(86, 66, 58, 10, 'OCT NOTE').style.justifyContent = 'center';
    this.small(148, 66, 58, 10, 'OCT NOTE').style.justifyContent = 'center';

    for (let t = 0; t < MAX_TRACKS; t++) {
      const y = ROW0 + ROW_H * t;
      const tr = () => m().tracks[t];
      const set = (f: (x: ReturnType<typeof tr>) => void) => edit((x) => f(x.main.tracks[t]));
      const off = () => !shown(t);
      const n = label(root, 8, y, 18, 22, String(t + 1), 'txt');
      this.r.fn(() => (n.style.opacity = off() ? '.35' : '1'));
      this.r.add(button(root, 28, y, 20, 22, 'M', () => set((x) => (x.mute = !x.mute)), { selected: () => tr().mute, disabled: off, title: `Track ${t + 1}: mute` }));
      const c = (x: number, w: number, get: () => number, put: (v: number) => void, lim: readonly [number, number], name: string, fmt?: (v: number) => string, title?: () => string) =>
        this.r.add(cell(root, x, y, w, 22, { get, set: put, ...range(lim), disabled: off, fmt, label: `Track ${t + 1} ${name}`, title: title ?? (() => `Track ${t + 1} ${name}`) }));
      const lowName = () => `${NOTE_NAMES[tr().loNote]} in octave ${tr().loOct} (MIDI ${tr().loOct * 12 + tr().loNote})`;
      const highName = () => `${NOTE_NAMES[tr().hiNote]} in octave ${tr().hiOct} (MIDI ${tr().hiOct * 12 + tr().hiNote})`;
      c(52, 30, () => tr().chan, (v) => set((x) => (x.chan = v)), LIMITS.chan, 'MIDI channel');
      c(86, 26, () => tr().loOct, (v) => set((x) => (x.loOct = v)), LIMITS.oct, 'low octave', undefined, () => `Track ${t + 1} lowest note: ${lowName()}`);
      c(114, 30, () => tr().loNote, (v) => set((x) => (x.loNote = v)), LIMITS.note, 'low note', (v) => NOTE_NAMES[v], () => `Track ${t + 1} lowest note: ${lowName()}`);
      c(148, 26, () => tr().hiOct, (v) => set((x) => (x.hiOct = v)), LIMITS.oct, 'high octave', undefined, () => `Track ${t + 1} highest note: ${highName()}`);
      c(176, 30, () => tr().hiNote, (v) => set((x) => (x.hiNote = v)), LIMITS.note, 'high note', (v) => NOTE_NAMES[v], () => `Track ${t + 1} highest note: ${highName()}`);
      c(210, 26, () => tr().so, (v) => set((x) => (x.so = v)), LIMITS.so, 'scale-base octave', undefined, () => `Track ${t + 1} S.O: the scale-pattern row its lowest octave reads`);
      SAME_NOTE_MODES.forEach((mode, k) => {
        this.r.add(button(root, 242 + 34 * k, y, 34, 22, mode, () => set((x) => (x.sameNote = mode)), { selected: () => tr().sameNote === mode, disabled: off, title: SAME_NOTE_TITLES[mode] }));
      });
      this.r.add(button(root, 348, y, 20, 22, 'D', () => set((x) => (x.disable = !x.disable)), {
        selected: () => tr().disable, disabled: off, title: `Track ${t + 1}: ignore scales and transposition (for drums)`,
      }));
      this.r.add(button(root, 372, y, 26, 22, 'LO', () => app.audition(t, false), { disabled: off, title: `Track ${t + 1}: play its lowest note` }));
      this.r.add(button(root, 400, y, 26, 22, 'HI', () => app.audition(t, true), { disabled: off, title: `Track ${t + 1}: play its highest note` }));
    }

    // ---- right column: maps and coordinates
    this.group(442, 54, 174, 158, 'SHAPE');
    this.r.add(button(root, 452, 66, 154, 26, 'RHYTHM MAP', () => app.go('rhythm'), { cls: 'shadow', title: 'Note lengths for each track' }));
    this.r.add(button(root, 452, 98, 154, 26, 'TONALITY MAP', () => app.go('tonality'), { cls: 'shadow', title: 'Scales and transpositions over time' }));
    this.r.add(button(root, 452, 130, 154, 26, 'SET COORDINATES', () => void this.setCoordinates(), { cls: 'shadow', disabled: playing, title: 'Choose where on the plot each track reads its notes and lengths' }));
    const coordState = label(root, 452, 162, 154, 40, '', 'small');
    coordState.style.justifyContent = 'center';
    coordState.style.textAlign = 'center';
    this.r.fn(() => {
      coordState.textContent = app.composeEnabled ? 'coordinates set:\nready to compose' : 'set coordinates\nbefore composing';
    });

    // ---- transport
    this.group(4, 230, 612, 46, 'PLAY');
    label(root, 14, 244, 50, 22, 'TEMPO');
    const tempo = el('input', 'tempo-input');
    tempo.inputMode = 'numeric';
    tempo.maxLength = 3;
    tempo.setAttribute('aria-label', 'Tempo in quarter notes per minute');
    tempo.title = 'Quarter notes per minute — type, or wheel / right-click +, ';
    ob(root, 'div', '', 66, 246, 36, 18).appendChild(tempo);
    const setTempo = (v: number) => {
      edit((x) => (x.main.tempo = inRange(v, LIMITS.tempo, x.main.tempo)));
      app.setLiveTempo(m().tempo);
    };
    tempo.addEventListener('change', () => setTempo(Number(tempo.value)));
    tempo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        setTempo(Number(tempo.value));
        tempo.blur();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        setTempo(m().tempo + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
        e.preventDefault();
      }
      e.stopPropagation();
    });
    tempo.addEventListener('wheel', (e) => {
      e.preventDefault();
      setTempo(m().tempo + (e.deltaY < 0 ? 1 : -1));
    }, { passive: false });
    tempo.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      setTempo(m().tempo + (app.prefs.swapButtons ? -1 : 1));
    });
    this.r.fn(() => {
      if (document.activeElement !== tempo) tempo.value = String(m().tempo);
    });
    this.r.add(button(root, 112, 240, 120, 30, 'COMPOSE!', () => void this.compose(), {
      cls: 'shadow default', disabled: () => !app.composeEnabled || playing(), selected: () => app.mode === 'composing',
      title: 'Compose from the plot in real time (Return). Space stops.',
    }));
    this.r.add(button(root, 242, 240, 100, 30, 'REPLAY', () => (app.mode === 'replaying' ? app.stop() : app.replay()), {
      cls: 'shadow', disabled: () => !app.recording || (playing() && app.mode !== 'replaying'), selected: () => app.mode === 'replaying',
      title: 'Play the composition in memory again at the current tempo (Space stops)',
    }));
    this.r.add(button(root, 352, 240, 130, 30, 'SAVE MIDI-FILE', () => app.saveMidiFile(), { cls: 'shadow', disabled: () => !app.recording, title: 'Save the composition in memory as a Standard MIDI File' }));
    this.small(492, 238, 120, 34, 'SPACE STOPS\nLEFT −  RIGHT +');

    // ---- set-ups, file options, menu
    this.setupSlots(4, 296, () => d().slots.main, (n) => edit((x) => (x.slots.main = n)), () => this.save(), () => void this.recall());
    this.group(312, 296, 214, 82, 'MIDI FILE / SYNC');
    this.small(320, 308, 40, 12, 'TYPE');
    for (const v of [0, 1] as const) {
      this.r.add(button(root, 364 + 30 * v, 304, 30, 20, String(v), () => edit((x) => (x.main.midiType = v)), { selected: () => m().midiType === v, title: v ? 'Saved MIDI file: type 1, a track per FrakMC track' : 'Saved MIDI file: type 0, one multi-channel track' }));
    }
    this.small(320, 332, 40, 12, 'PPQN');
    for (const [i, v] of [[0, 96], [1, 192]] as const) {
      this.r.add(button(root, 364 + 34 * i, 328, 34, 20, String(v), () => edit((x) => (x.main.ppqn = v)), { selected: () => m().ppqn === v, title: `${v} ticks per quarter note (192 plays the same lengths twice as fast)` }));
    }
    this.r.add(button(root, 444, 304, 74, 44, 'CLOCK', () => edit((x) => (x.main.clock = !x.main.clock)), { selected: () => m().clock, title: 'Send MIDI clock (start, 24 per quarter, stop)' }));
    this.small(320, 356, 200, 18, 'TYPE & PPQN apply to saved files').style.opacity = '.8';
    this.r.add(button(root, 536, 336, 80, 40, 'MENU', () => {
      app.stop();
      app.go('startup');
    }, { cls: 'exit', title: 'Back to the FrakMC menu' }));
    this.small(4, 340, 300, 36, 'SET-UPS keep the whole screen, the coordinates,\nthe plot name and the rhythm/tonality slots.').style.opacity = '.8';
  }

  private save(): void {
    this.app.edit((d) => {
      const s = clone(d.main);
      s.rhythmSlot = d.slots.rhythm;
      s.tonalitySlot = d.slots.tonality;
      d.banks.main[d.slots.main] = s;
    });
  }

  private async recall(): Promise<void> {
    const app = this.app;
    const rec = app.doc.banks.main[app.doc.slots.main];
    if (!rec) {
      await this.emptySlot();
      return;
    }
    app.stop();
    app.edit((d) => {
      d.main = clone(rec);
      d.slots.rhythm = rec.rhythmSlot;
      d.slots.tonality = rec.tonalitySlot;
    });
    app.coordsConfirmed = false;
    if (rec.plotName !== app.doc.plot.name) {
      const lib = app.prefs.plotLibrary.find((p) => p.name === rec.plotName);
      const choice = await alertBox(2, ['THIS SET-UP WAS MADE ON', `PLOT ${rec.plotName}.`, '', `SWITCH TO IT, OR STAY ON`, `${app.doc.plot.name}?`], ['STAY', 'SWITCH'], 0);
      if (choice === 1) {
        if (lib) await app.setPlot(lib);
        else await alertBox(1, ['', `NO PLOT CALLED ${rec.plotName}`, 'IN THE PLOT LIBRARY', ''], ['O.K.']);
      }
    }
  }

  private async setCoordinates(): Promise<void> {
    const app = this.app;
    const m = app.doc.main;
    if (m.plotName === app.doc.plot.name && app.coordsComplete()) {
      const keep = await alertBox(2, ['', 'KEEP THE COORDINATES', 'ALREADY SET?', ''], ['REDRAW', 'KEEP'], 1);
      if (keep === 1) {
        app.coordsConfirmed = true;
        app.changed(false);
        return;
      }
    }
    app.go('coords');
  }

  private async compose(): Promise<void> {
    const app = this.app;
    if (!app.composeEnabled || app.scheduler.playing) return;
    const go = await alertBox(0, ['READY TO COMPOSE', '', 'RETURN STARTS', 'SPACE STOPS'], ['START', 'CANCEL'], 0);
    if (go !== 0) return;
    if (app.startCompose()) app.go('compose');
  }

  onKey(e: KeyboardEvent): boolean {
    if (e.key === 'Enter' && !(e.target instanceof HTMLInputElement)) {
      void this.compose();
      return true;
    }
    return false;
  }
}

function range(l: readonly [number, number]): { min: number; max: number } {
  return { min: l[0], max: l[1] };
}

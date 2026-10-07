/**
 * The application: owns the document, preferences and services, and performs the actions the
 * screens ask for. Screens never touch MIDI, the scheduler or storage directly.
 */
import { FULLSET, type PlotSpec, plotKey } from '../fractal/mandelbrot';
import { PlotCancelled, PlotClient } from '../fractal/plotClient';
import { Monitor } from '../midi/monitor';
import { Router } from '../midi/router';
import { WebMidi } from '../midi/webmidi';
import { Composer, type ComposeInput, MissingCoordinates } from '../music/composer';
import { factoryDocument } from '../music/factory';
import { type Sequence, bytesToSequence, noteEventsToSequence, sequenceToBytes } from '../music/recording';
import { fromBase64, toBase64 } from '../midi/smf';
import { DocStore, documentFromJson, documentToJson, StorageFull } from '../persistence/storage';
import { Scheduler, type StopReason } from '../scheduler/scheduler';
import { ComposeSource, SequenceSource } from '../scheduler/sources';
import { type FMCDocument, clone, MAX_TRACKS, normPlot } from '../state/document';
import { alertBox } from '../ui/alert';
import { download, setUiPrefs } from '../ui/dom';
import { DEFAULT_DISPLAY, type DisplayPrefs, PlotView, paperInk, stCss } from '../ui/plotView';

export interface Prefs {
  swapButtons: boolean;
  display: DisplayPrefs;
  midiOut: string;
  /** send to the internal monitor too */
  monitorOn: boolean;
  showMonitor: boolean;
  plotLibrary: PlotSpec[];
}

const DEFAULT_PREFS: Prefs = {
  swapButtons: false,
  display: DEFAULT_DISPLAY,
  midiOut: '',
  monitorOn: true,
  showMonitor: true,
  plotLibrary: [FULLSET],
};

export interface Screen {
  readonly name: string;
  mount(layer: HTMLElement): void;
  unmount(): void;
  refresh(): void;
  /** return true if handled */
  onKey?(e: KeyboardEvent): boolean;
  /** called every animation frame while mounted */
  frame?(): void;
}

export type ScreenName = 'startup' | 'main' | 'rhythm' | 'tonality' | 'scales' | 'patch' | 'coords' | 'compose' | 'zoom' | 'player';

export type PlayMode = 'idle' | 'composing' | 'replaying' | 'player';

export class App {
  doc: FMCDocument;
  prefs: Prefs;
  readonly store = new DocStore();
  readonly midi = new WebMidi();
  readonly router = new Router();
  readonly monitor = new Monitor();
  readonly scheduler: Scheduler;
  readonly plots = new PlotClient();
  view!: PlotView;
  counts: Uint16Array | null = null;
  plotRows = 0;
  recording: Sequence | null = null;
  mode: PlayMode = 'idle';
  /** live composition (while composing) */
  composer: Composer | null = null;
  private composeSource: ComposeSource | null = null;
  /** COMPOSE! needs SET COORDINATES after recalling a set-up, loading a plot, changing type */
  coordsConfirmed = true;
  /** scale slot the scale-pattern editor opens on */
  scaleSlot = 0;
  dirty = false;
  private screens = new Map<ScreenName, () => Screen>();
  screen: Screen | null = null;
  screenName: ScreenName = 'startup';
  layer!: HTMLElement;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();
  private removeMonitor: (() => void) | null = null;
  lastError = '';

  constructor() {
    this.prefs = this.store.loadPrefs(DEFAULT_PREFS);
    if (!Array.isArray(this.prefs.plotLibrary) || !this.prefs.plotLibrary.length) this.prefs.plotLibrary = [FULLSET];
    this.prefs.plotLibrary = this.prefs.plotLibrary.map(normPlot);
    this.doc = this.store.loadCurrent() ?? factoryDocument();
    this.loadRecording();
    this.scheduler = new Scheduler(this.router);
    this.scheduler.onStop = (r) => this.onStopped(r);
    setUiPrefs({ swapButtons: () => this.prefs.swapButtons });
    this.applyMonitor();
  }

  // ------------------------------------------------------------------ wiring

  registerScreen(name: ScreenName, make: () => Screen): void {
    this.screens.set(name, make);
  }

  onChange(f: () => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  /** Notify screens and chrome; autosave. */
  changed(save = true): void {
    if (save) {
      this.dirty = true;
      if (this.saveTimer) clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.autosave(), 400);
    }
    this.screen?.refresh();
    for (const f of this.listeners) f();
  }

  /** Mutate the document. */
  edit(fn: (d: FMCDocument) => void): void {
    fn(this.doc);
    if (this.scheduler.playing && this.mode !== 'player') this.scheduler.setTempo(this.doc.main.tempo);
    this.changed();
  }

  autosave(): void {
    try {
      this.store.saveCurrent(this.doc);
      this.lastError = '';
    } catch (e) {
      this.lastError = e instanceof StorageFull ? e.message : 'Could not save to browser storage';
    }
  }

  savePrefs(): void {
    this.store.savePrefs(this.prefs);
    for (const f of this.listeners) f();
  }

  go(name: ScreenName): void {
    const make = this.screens.get(name);
    if (!make) return;
    this.screen?.unmount();
    this.layer.replaceChildren();
    this.view.clearOverlay();
    this.screenName = name;
    this.screen = make();
    this.screen.mount(this.layer);
    this.screen.refresh();
    for (const f of this.listeners) f();
  }

  openScale(slot: number): void {
    this.scaleSlot = slot;
    this.go('scales');
  }

  // ------------------------------------------------------------------ display

  applyDisplay(): void {
    const { paper, ink } = paperInk(this.prefs.display);
    const root = document.documentElement.style;
    root.setProperty('--paper', stCss(paper));
    root.setProperty('--ink', stCss(ink));
    this.view.setDisplay(this.prefs.display);
  }

  /** Make sure the current plot is computed and shown. */
  async showPlot(): Promise<void> {
    const spec = this.doc.plot;
    const key = plotKey(spec);
    const hit = this.plots.cached(spec);
    this.view.setPlot(hit, spec.iterations);
    if (hit) {
      this.counts = hit;
      this.plotRows = 400;
      return;
    }
    this.counts = null;
    this.plotRows = 0;
    this.view.setPlot(null, spec.iterations);
    try {
      const done = await this.plots.plot(spec, (row0, rows, c) => {
        if (plotKey(this.doc.plot) !== key) return;
        if (!this.counts) {
          this.counts = c;
          this.view.setPlot(c, spec.iterations);
        }
        this.plotRows = row0 + rows;
        this.view.rows(row0, rows);
        for (const f of this.listeners) f();
      });
      if (plotKey(this.doc.plot) === key) {
        this.counts = done;
        this.plotRows = 400;
      }
    } catch (e) {
      if (!(e instanceof PlotCancelled)) throw e;
    }
    for (const f of this.listeners) f();
  }

  /** Load a different plot into the composer (disables COMPOSE! until coordinates are set). */
  async setPlot(spec: PlotSpec): Promise<void> {
    this.edit((d) => (d.plot = { ...spec }));
    if (this.doc.main.plotName !== spec.name) this.coordsConfirmed = false;
    this.addToLibrary(spec);
    await this.showPlot();
  }

  addToLibrary(spec: PlotSpec): void {
    const lib = this.prefs.plotLibrary.filter((p) => p.name !== spec.name);
    lib.push({ ...spec });
    lib.sort((a, b) => (a.name === FULLSET.name ? -1 : b.name === FULLSET.name ? 1 : a.name.localeCompare(b.name)));
    this.prefs.plotLibrary = lib;
    this.savePrefs();
  }

  // ------------------------------------------------------------------ MIDI

  async initMidi(): Promise<void> {
    this.midi.onChange(() => this.selectOutput(this.prefs.midiOut, false));
    await this.midi.init();
    this.selectOutput(this.prefs.midiOut, false);
  }

  /** Choose the output device ('' = none). Notes on the old device are released first. */
  selectOutput(id: string, remember = true): void {
    const sink = id ? this.midi.sink(id) : null;
    this.router.setDevice(sink);
    if (remember) {
      this.prefs.midiOut = id;
      this.savePrefs();
    } else for (const f of this.listeners) f();
  }

  get outputName(): string {
    if (!this.prefs.midiOut) return 'none';
    const o = this.midi.outputs().find((x) => x.id === this.prefs.midiOut);
    if (!o) return 'none';
    return o.connected && this.router.hasDevice ? o.name : `${o.name} (disconnected)`;
  }

  applyMonitor(): void {
    this.removeMonitor?.();
    this.removeMonitor = this.prefs.monitorOn ? this.router.addListener(this.monitor) : null;
  }

  panic(): void {
    this.stop();
    this.router.panic(this.doc.main.tracks.map((t) => t.chan - 1));
    this.monitor.clear();
  }

  sendNow(bytes: number[]): void {
    this.router.send(bytes);
  }

  /** LO / HI audition (400 ms, velocity 100 — UNCERTAINTIES U8). */
  audition(track: number, hi: boolean): void {
    const t = this.doc.main.tracks[track];
    const note = Math.max(0, Math.min(127, hi ? t.hiOct * 12 + t.hiNote : t.loOct * 12 + t.loNote));
    const ch = (t.chan - 1) & 15;
    const now = performance.now();
    this.router.send([0x90 | ch, note, 100], now);
    this.router.send([0x80 | ch, note, 0], now + 400);
  }

  sendPatch(): void {
    const { chan, program } = this.doc.patch;
    this.router.send([0xc0 | ((chan - 1) & 15), (program - 1) & 127]);
  }

  // ------------------------------------------------------------------ composing

  /** Coordinates complete for every active track in the current mode? */
  coordsComplete(): boolean {
    const m = this.doc.main;
    for (let t = 0; t < m.numTracks; t++) {
      if (m.tracks[t].mute) continue;
      if (m.fractalType === 'julia') {
        if (!m.juliaPoints[t]) return false;
      } else {
        if (!m.boxes[2 * t]) return false;
        if (this.doc.rhythm.tracks[t].type === 'DUR' && !m.boxes[2 * t + 1]) return false;
      }
    }
    return true;
  }

  get composeEnabled(): boolean {
    return this.coordsConfirmed && this.doc.main.plotName === this.doc.plot.name && this.coordsComplete();
  }

  composeInput(): ComposeInput {
    const d = this.doc;
    const rhythm = clone(d.rhythm);
    if (d.main.fractalType === 'julia') for (const t of rhythm.tracks) t.type = 'SEQ';
    return { main: clone(d.main), rhythm, tonality: clone(d.tonality), scales: clone(d.scales), plot: { ...d.plot }, juliaRng: d.juliaRng, juliaFromPlot: d.options.juliaFromPlot };
  }

  /** Start composing in real time (after the START alert). Returns false if impossible. */
  startCompose(): boolean {
    this.stop();
    let c: Composer;
    try {
      c = new Composer(this.composeInput());
    } catch (e) {
      if (e instanceof MissingCoordinates) void alertBox(1, ['', e.message.toUpperCase(), ''], ['O.K.']);
      return false;
    }
    this.composer = c;
    this.composeSource = new ComposeSource(c);
    this.mode = 'composing';
    this.monitor.clear();
    const m = this.doc.main;
    this.scheduler.start(this.composeSource, { ppqn: m.ppqn, tempo: m.tempo, clock: m.clock });
    this.changed(false);
    return true;
  }

  replay(): void {
    if (!this.recording) return;
    this.stop();
    this.mode = 'replaying';
    const m = this.doc.main;
    this.scheduler.start(new SequenceSource(this.recording), { ppqn: this.recording.ppqn, tempo: m.tempo, clock: m.clock });
    this.changed(false);
  }

  /** Play an arbitrary sequence (MIDI-file player). */
  playSequence(seq: Sequence, tempo: number, clock: boolean, skip: (e: { bytes: number[]; track: number }) => boolean): void {
    this.stop();
    this.mode = 'player';
    this.scheduler.start(new SequenceSource(seq, skip), { ppqn: seq.ppqn, tempo, clock });
    this.changed(false);
  }

  setLiveTempo(bpm: number): void {
    if (this.scheduler.playing) this.scheduler.setTempo(bpm);
  }

  /** <SPACE>: halt whatever is playing. Notes are released by the scheduler. */
  stop(): void {
    if (this.scheduler.playing) this.scheduler.stop('user');
  }

  private onStopped(_r: StopReason): void {
    if (this.mode === 'composing' && this.composeSource && this.composer) {
      const src = this.composeSource;
      const m = this.doc.main;
      const seq = noteEventsToSequence(src.recorded, m.ppqn, m.tempo, src.endTick);
      this.recording = seq;
      this.doc.composition = src.recorded.length ? toBase64(sequenceToBytes(seq, m.midiType, this.doc.name, this.doc.options.writeTempo)) : null;
      if (m.fractalType === 'julia') this.doc.juliaRng = this.composer.rng.state;
      if (src.full) void alertBox(1, ['', 'COMPOSITION FULL', `(${src.recorded.length} EVENTS)`, ''], ['O.K.']);
      this.composer = null;
      this.composeSource = null;
      this.mode = 'idle';
      if (this.screenName === 'compose') this.go('main');
      this.changed();
      return;
    }
    this.mode = 'idle';
    this.changed(false);
  }

  loadRecording(): void {
    this.recording = null;
    if (!this.doc.composition) return;
    try {
      const seq = bytesToSequence(fromBase64(this.doc.composition));
      seq.tempo = this.doc.main.tempo;
      this.recording = seq;
    } catch {
      this.doc.composition = null;
    }
  }

  saveMidiFile(): void {
    if (!this.recording) return;
    const bytes = sequenceToBytes({ ...this.recording, tempo: this.doc.main.tempo }, this.doc.main.midiType, this.doc.name, this.doc.options.writeTempo);
    download(`${this.doc.name || 'FRAKMC'}.MID`, bytes, 'audio/midi');
  }

  /** Compose without real time for `quarters` quarter notes and keep it as the recording. */
  renderOffline(quarters: number): number {
    this.stop();
    const c = new Composer(this.composeInput());
    const src = new ComposeSource(c);
    const ticks = quarters * this.doc.main.ppqn;
    src.fill(ticks, []);
    src.finish(ticks);
    const m = this.doc.main;
    this.recording = noteEventsToSequence(src.recorded, m.ppqn, m.tempo, src.endTick);
    this.doc.composition = toBase64(sequenceToBytes(this.recording, m.midiType, this.doc.name, this.doc.options.writeTempo));
    if (m.fractalType === 'julia') this.doc.juliaRng = c.rng.state;
    this.changed();
    return src.recorded.length;
  }

  // ------------------------------------------------------------------ documents

  /** Replace the document (stops playback first, releasing notes). */
  async loadDocument(d: FMCDocument): Promise<void> {
    this.stop();
    this.router.releaseAll();
    this.doc = d;
    this.coordsConfirmed = true;
    this.loadRecording();
    this.addToLibrary(d.plot);
    this.dirty = false;
    this.autosave();
    await this.showPlot();
    this.go(this.screenName === 'compose' || this.screenName === 'coords' ? 'main' : this.screenName);
    this.changed(false);
  }

  newDocument(): Promise<void> {
    return this.loadDocument(factoryDocument());
  }

  saveNamed(name: string): void {
    this.doc.name = name.toUpperCase().slice(0, 40) || 'UNTITLED';
    this.store.save(this.doc);
    this.dirty = false;
    this.autosave();
    this.changed(false);
  }

  exportJson(): void {
    download(`${this.doc.name || 'FRAKMC'}.frakmc.json`, documentToJson(this.doc), 'application/json');
  }

  async importJson(text: string): Promise<void> {
    await this.loadDocument(documentFromJson(text));
  }

  /** Track slots in use for the coordinate prompt etc. */
  get activeTracks(): number[] {
    const m = this.doc.main;
    return Array.from({ length: Math.min(m.numTracks, MAX_TRACKS) }, (_, i) => i);
  }
}

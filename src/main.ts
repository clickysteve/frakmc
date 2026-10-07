/**
 * FrakMC — bootstrap: build the chrome, register the screens, start the frame loop.
 */
import '@fontsource/vt323';
import './ui/gem.css';
import { App } from './app/app';
import { modalOpen, setAlertLayer } from './ui/alert';
import { buildMenuBar, buildMonitor, buildStatus } from './ui/chrome';
import { PlotView } from './ui/plotView';
import { ComposeScreen } from './ui/screens/compose';
import { CoordsScreen } from './ui/screens/coords';
import { MainScreen } from './ui/screens/main';
import { PlayerScreen } from './ui/screens/player';
import { RhythmScreen } from './ui/screens/rhythm';
import { PatchScreen, StartupScreen } from './ui/screens/simple';
import { ScaleScreen, TonalityScreen } from './ui/screens/tonality';
import { ZoomScreen } from './ui/screens/zoom';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const app = new App();
app.layer = $('layer');
app.view = new PlotView($<HTMLCanvasElement>('plot'), $<HTMLCanvasElement>('overlay'));
setAlertLayer(app.layer);

app.registerScreen('startup', () => new StartupScreen(app));
app.registerScreen('main', () => new MainScreen(app));
app.registerScreen('patch', () => new PatchScreen(app));
app.registerScreen('rhythm', () => new RhythmScreen(app));
app.registerScreen('tonality', () => new TonalityScreen(app));
app.registerScreen('scales', () => new ScaleScreen(app));
app.registerScreen('coords', () => new CoordsScreen(app));
app.registerScreen('compose', () => new ComposeScreen(app));
app.registerScreen('zoom', () => new ZoomScreen(app));
app.registerScreen('player', () => new PlayerScreen(app));

buildMenuBar(app, $('menubar'));
const monitorFrame = buildMonitor(app, $('monitor'));
const statusFrame = buildStatus(app, $('statusbar'));
app.applyDisplay();

// ---- scale the 640×400 ST screen to fit
const stage = $('stage');
const wrap = $('stage-wrap');
function fit(): void {
  const r = wrap.getBoundingClientRect();
  const s = Math.max(0.4, Math.min((r.width - 16) / 640, (r.height - 16) / 400));
  const scale = s >= 1 ? Math.floor(s * 4) / 4 : s;
  stage.style.zoom = String(scale);
}
new ResizeObserver(fit).observe(wrap);
fit();

// ---- keyboard: the screen first; Space always halts
document.addEventListener('keydown', (e) => {
  if (modalOpen) return;
  const t = e.target as HTMLElement;
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
  if (e.key === ' ' && app.scheduler.playing) {
    e.preventDefault();
    app.stop();
    return;
  }
  if (/^F([1-9]|1[0-2])$/.test(e.key) && app.screenName === 'coords') e.preventDefault();
  if (app.screen?.onKey?.(e)) e.preventDefault();
});
// right-clicks belong to FrakMC (they increment values)
stage.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- frame loop: screen animation, monitor, status
let last = 0;
function frame(t: number): void {
  app.screen?.frame?.();
  monitorFrame();
  if (t - last > 120) {
    statusFrame();
    last = t;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// stop sounding notes if the page goes away
window.addEventListener('pagehide', () => {
  app.stop();
  app.router.releaseAll();
});

app.go('startup');
void app.showPlot();
void app.initMidi();

// expose for debugging / browser tests
(window as unknown as { frakmc: App }).frakmc = app;

// End-to-end test: drives the real FrakMC interface in Chrome with real mouse and keyboard
// events (Chrome DevTools Protocol via puppeteer-core), checks the results, and saves the
// screenshots used in docs/QUICK-START.md.
//
//   npm run build && npm run e2e            (uses the built site via `vite preview`)
//   CHROME=/path/to/chrome npm run e2e      (if Chrome is somewhere else)
//
// Needs a local Chrome/Chromium; nothing is downloaded.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync);
if (!CHROME) {
  console.error('No Chrome found; set CHROME=/path/to/chrome');
  process.exit(2);
}
const SHOTS = process.env.SHOTS ?? 'docs/images';
mkdirSync(SHOTS, { recursive: true });
const PORT = 4321;
const URL = `http://localhost:${PORT}/`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && (clearTimeout(t), res()));
});

const cleanup = () => server.kill();
process.on('exit', cleanup);
process.on('uncaughtException', (e) => {
  console.error(e);
  cleanup();
  process.exit(1);
});

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ok ' : 'FAIL '} ${msg}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions(URL, ['midi']);
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.frakmc && window.frakmc.plotRows === 400, { timeout: 20000 });

const fmc = (fn, arg) => page.evaluate(fn, arg);
/** centre of the first element matching selector whose text equals `text` (works through CSS zoom) */
async function centre(text, sel = '#layer button, #layer .cell, .alert button, .menu .item, #menubar .title') {
  const p = await page.evaluate(({ text, sel }) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text || e.getAttribute('aria-label') === text || e.title === text);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, { text, sel });
  if (!p) throw new Error(`no element "${text}"`);
  return p;
}
async function click(text, button = 'left', sel) {
  const p = await centre(text, sel);
  await page.mouse.click(p.x, p.y, { button });
  await sleep(120);
}
/** plot pixel → page coordinates */
async function plotPoint(x, y) {
  return page.evaluate(([x, y]) => {
    const r = document.getElementById('stage').getBoundingClientRect();
    return { x: r.left + ((x + 0.5) * r.width) / 640, y: r.top + ((y + 0.5) * r.height) / 400 };
  }, [x, y]);
}
async function drag(x1, y1, x2, y2) {
  const a = await plotPoint(x1, y1), b = await plotPoint(x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await sleep(120);
}
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

console.log('FrakMC end-to-end');

// ---- start-up
const midiStatus = await fmc(() => window.frakmc.midi.status + ' ' + window.frakmc.midi.error);
console.log(`  ..  Web MIDI in this Chrome: ${midiStatus}`);
await shot('qs-startup');
await click('COMPOSE');
ok((await fmc(() => window.frakmc.screenName)) === 'main', 'menu → Composer screen');
await shot('qs-main');

// ---- value cells: left −, right +
await click('Track 1 MIDI channel', 'right');
await click('Track 1 MIDI channel', 'right');
await click('Track 1 MIDI channel', 'left');
ok((await fmc(() => window.frakmc.doc.main.tracks[0].chan)) === 2, 'right click increments, left click decrements');
await click('Track 1 MIDI channel', 'left');
await click('Number of tracks', 'left');
ok((await fmc(() => window.frakmc.doc.main.numTracks)) === 5, 'TRACKS decrements');
await click('Number of tracks', 'right');

// ---- rhythm, tonality, scale editors
await click(' RHYTHM MAP '.trim(), 'left');
ok((await fmc(() => window.frakmc.screenName)) === 'rhythm', 'RHYTHM MAP opens the Rhythm Editor');
await click('Track 4 length 2', 'right');
ok((await fmc(() => window.frakmc.doc.rhythm.tracks[3].lengths[1])) === 7, 'rhythm length edited');
await click('Track 4 length 2', 'left');
await shot('qs-rhythm');
await click('CLOSE');
await click('TONALITY MAP');
ok((await fmc(() => window.frakmc.screenName)) === 'tonality', 'TONALITY MAP opens the Tonality Editor');
await shot('qs-tonality');
await click('EDIT…');
await click('7');
await click('SHOW');
ok((await fmc(() => document.querySelector('#layer .name-input').value)) === 'MAJ HOLD', 'scale-pattern editor shows pattern 7');
await shot('qs-scales');
await click('CLOSE');
await click('CLOSE');

// ---- set coordinates (Mandelbrot)
await click('SET COORDINATES');
await click('REDRAW', 'left', '.alert button');
ok((await fmc(() => window.frakmc.screenName)) === 'coords', 'SET COORDINATES → REDRAW opens the plot');
await drag(350, 280, 370, 300);
await drag(360, 100, 384, 116);
await drag(420, 300, 438, 322);
await drag(450, 70, 470, 90);
await page.keyboard.press('Backspace');
await drag(450, 70, 470, 90);
const prompt = await fmc(() => document.querySelector('.prompt').textContent);
ok(prompt.includes('TRACK 3: DRAG THE NOTE BOX'), `prompt advances: "${prompt.trim()}"`);
// examine with the right button held
const ex = await plotPoint(540, 120);
await page.mouse.move(ex.x, ex.y);
await page.mouse.down({ button: 'right' });
await sleep(80);
const examine = await fmc(() => document.querySelector('.prompt').textContent);
await shot('qs-coords');
await page.mouse.up({ button: 'right' });
ok(/TRACK 3 {2}NOTE \S+ {2}OCTAVE \d/.test(examine), `right button examines: "${examine.trim()}"`);
for (const k of ['F1', 'F2', 'F3', 'F4', 'F1', 'F2', 'F3', 'F4']) {
  await page.keyboard.press(k);
  await sleep(40);
}
ok((await fmc(() => window.frakmc.screenName)) === 'main', 'F-keys complete the boxes and return to the Composer');
ok(await fmc(() => window.frakmc.composeEnabled), 'COMPOSE! enabled');

// ---- compose in real time
await page.keyboard.press('Enter');
await sleep(300);
await page.keyboard.press('Enter');
await sleep(6000);
ok((await fmc(() => window.frakmc.mode)) === 'composing', 'composing after Return');
const during = await fmc(() => ({ late: window.frakmc.scheduler.maxLateMs, sent: window.frakmc.router.sent }));
ok(during.sent > 30, `MIDI messages sent while composing (${during.sent})`);
// Headless Chrome on a desktop OS can be descheduled for 100+ ms at a time (measured below), so
// lateness here is reported, not asserted; scheduler timing is asserted in the unit tests and
// was stress-tested in a visible browser (docs/QUICK-START.md, "Timing").
const stall = await page.evaluate(async () => {
  let worst = 0;
  for (let k = 0; k < 200; k++) {
    const s = performance.now();
    let x = 0;
    for (let i = 0; i < 100000; i++) x += Math.sqrt(i);
    worst = Math.max(worst, performance.now() - s);
    await new Promise((r) => setTimeout(r, 2));
  }
  return Math.round(worst);
});
console.log(`  ..  max scheduling lateness ${Math.round(during.late)} ms (this headless browser stalls up to ${stall} ms on a sub-ms loop)`);
await shot('qs-compose'); // (a headless screenshot pauses the page; checked before it)
await page.keyboard.press(' ');
await sleep(400);
const after = await fmc(() => ({ mode: window.frakmc.mode, sounding: window.frakmc.router.soundingCount, rec: window.frakmc.recording?.events.length ?? 0, screen: window.frakmc.screenName }));
ok(after.mode === 'idle' && after.screen === 'main', 'Space stops and returns to the Composer');
ok(after.sounding === 0, 'no notes left sounding after stop');
ok(after.rec > 20, `composition recorded (${after.rec} events)`);

// ---- MIDI file export through the button (download intercepted)
await page.evaluate(() => {
  window.__dl = [];
  const orig = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) window.__dl.push({ name: this.download, href: this.href });
    else orig.call(this);
  };
});
await click('SAVE MIDI-FILE');
const mid = await page.evaluate(async () => {
  const d = window.__dl.at(-1);
  const b = new Uint8Array(await (await fetch(d.href)).arrayBuffer());
  return { name: d.name, head: String.fromCharCode(...b.slice(0, 4)), fmt: b[9], div: (b[12] << 8) | b[13] };
});
ok(mid.head === 'MThd' && mid.fmt === 0 && mid.div === 96, `SAVE MIDI-FILE writes ${mid.name} (type ${mid.fmt}, ${mid.div} PPQN)`);

// ---- replay
await click('REPLAY');
await sleep(1500);
ok((await fmc(() => window.frakmc.mode)) === 'replaying', 'REPLAY plays the composition');
await click('REPLAY');
await sleep(200);
ok((await fmc(() => window.frakmc.router.soundingCount)) === 0, 'REPLAY again stops cleanly');

// ---- panic
await page.evaluate(() => window.frakmc.router.send([0x90, 60, 100]));
await click('PANIC', 'left', '#menubar .panic');
ok((await fmc(() => window.frakmc.router.soundingCount)) === 0, 'PANIC releases everything');

// ---- Julia
await click('JULIA', 'left');
await sleep(300);
await page.keyboard.press('Enter');
await sleep(250);
await click('SET COORDINATES');
for (const [x, y] of [[320, 213], [456, 105], [400, 120], [240, 200], [535, 250], [380, 290]]) {
  const p = await plotPoint(x, y);
  await page.mouse.click(p.x, p.y);
  await sleep(60);
}
ok((await fmc(() => window.frakmc.doc.main.juliaPoints.filter(Boolean).length)) === 6, 'six Julia points set by clicking');
await page.keyboard.press('Enter');
await sleep(300);
await page.keyboard.press('Enter');
await sleep(25000);
await shot('qs-julia');
await page.keyboard.press(' ');
await sleep(300);
ok((await fmc(() => window.frakmc.router.soundingCount)) === 0, 'Julia composition stopped cleanly');

// ---- player
await click('MENU');
await click('MIDI FILES');
await sleep(200);
await shot('qs-player');
await click('CONVERT');
ok((await fmc(() => document.querySelector('#layer .label.left').textContent)).includes('TYPE 1'), 'CONVERT type 0 → 1');
await click('CLOSE');

// ---- zoom
await click('EXPLORE');
await click('ZOOM', 'left', '.alert button');
await drag(515, 92, 595, 142);
await click('72', 'left', '.alert button');
await click('LATER', 'left', '.alert button');
await page.waitForFunction(() => document.querySelector('.alert')?.textContent.includes('PLOTTED IN'), { timeout: 20000 });
await sleep(300);
await shot('qs-zoom');
await page.keyboard.press('Enter');
await sleep(300);
await click('DONE', 'left', '.alert button');
await click('DISCARD', 'left', '.alert button');
ok((await fmc(() => window.frakmc.screenName)) === 'startup', 'EXPLORE returns to the menu');

// ---- colours
await page.evaluate(() => {
  const p = window.frakmc.prefs.display;
  p.mode = 'colour';
  p.colour = [[0, 0, 0], [7, 2, 0], [2, 5, 7], [7, 7, 2]];
  window.frakmc.applyDisplay();
  window.frakmc.go('main');
});
await sleep(400);
await shot('qs-colour');

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
server.kill();
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);

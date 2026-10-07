# FrakMC

**FrakMC** turns the Mandelbrot and Julia sets into music for up to six MIDI instruments, in the
browser, playing your own synthesizers through Web MIDI.

**Use it:** <https://frakmc.allmyfriendsaresynths.com> · **Start here:**
[Quick Start guide](docs/QUICK-START.md)

![The FrakMC Composer](docs/images/qs-main.png)

FrakMC is an independent browser-based fractal music composition project inspired by and informed
by Hugh McDowell's *Fractal Music Composer 2* for the Atari ST.

FrakMC is independently implemented and is not an official port or continuation of Fractal Music
Composer. It is not affiliated with or endorsed by Hugh McDowell or any historical publisher or
distributor of FMC/FMC2. The original FMC/FMC2 software, documentation and associated historical
materials are not distributed with FrakMC.

## What it does

FrakMC follows the musical model of Fractal Music Composer 2, worked out from its manual and from
examining the program (documented in [docs/BEHAVIOUR.md](docs/BEHAVIOUR.md)):

- each track reads a **note box** and a **length box** on a Mandelbrot plot, one pixel per note;
- each pixel's escape count — computed the way the original does, so plots match it pixel for
  pixel — picks the pitch through an up-and-down walk of the track's range, the **scale
  patterns**, the **tonality map** and the **rhythm map**, and loudness grows towards the set;
- in Julia mode six Julia sets are drawn dot by dot while they play, position giving pitch and
  height giving loudness.

Around that model FrakMC has its own interface in an Atari GEM style: a launcher, the Composer,
Rhythm Map, Tonality Map, Scale Pattern editor, Set Coordinates, Explore (zoom) and a MIDI File
Analyser, plus a MIDI monitor, panic button, autosave, document files, MIDI file export and import
of data files from your own copy of the original program.

## Run it locally

You need [Node.js](https://nodejs.org/) 20.19 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:5299> in Chrome, Edge, Opera or Firefox and allow MIDI access when asked.
Safari has no Web MIDI; FrakMC still runs there with its built-in MIDI monitor.

```bash
npm test
```

```bash
npm run build
```

```bash
npm run e2e
```

`npm test` runs the unit tests (fractal maths, composer, scheduler, MIDI files, persistence, file
formats). `npm run build` writes a static site to `dist/`. `npm run e2e` drives the built site in
a local Chrome with real mouse and keyboard events and refreshes the screenshots in `docs/images`
(it needs Chrome installed; nothing is downloaded).

## Hosting

FrakMC is a static site: no server, database, accounts, API keys or external services. All
plotting, composing and MIDI happen in the browser; work is kept in the browser's local storage
and in files you export. There is no analytics or telemetry.

[.github/workflows/pages.yml](.github/workflows/pages.yml) tests, type-checks, builds and deploys
to GitHub Pages on every push to `main`. The [CNAME](CNAME) file makes it build for the domain
root. One-time setup on GitHub: **Settings ▸ Pages ▸ Source: GitHub Actions**, and **Custom
domain: `frakmc.allmyfriendsaresynths.com`**, with a DNS `CNAME` record for that name pointing to
`clickysteve.github.io`.

## How it is built

TypeScript, Vite, no UI framework.

| Folder | Concern |
|---|---|
| `src/fractal/` | Fixed-point Mandelbrot iteration, plots, zoom, Julia inverse iteration; plotting in a Web Worker. |
| `src/music/` | The composition engine (`Composer.step()`, deterministic), note table and pitch rules, factory content, recordings. |
| `src/scheduler/` | Look-ahead scheduler on a worker timer; timestamped MIDI; live-compose and replay sources. |
| `src/midi/` | Web MIDI and hot-plug, note tracking and panic, the monitor, Standard MIDI Files. |
| `src/state/`, `src/persistence/` | Versioned document model; browser storage; JSON; readers for the original program's file formats. |
| `src/ui/`, `src/app/` | The screens and the application that connects them. |

## Documentation

- [Quick Start](docs/QUICK-START.md) — using FrakMC.
- [Research notes](docs/RESEARCH.md) — what was found out about Fractal Music Composer 2, and how.
- [Behaviour specification](docs/BEHAVIOUR.md) — the rules FrakMC implements, with evidence labels.
- [Uncertainties and differences](docs/UNCERTAINTIES.md) — what is approximated or deliberately different.
- [Provenance](docs/PROVENANCE.md) — sources, the provenance audit, and what is not included.

## Credits

Fractal Music Composer was created by Hugh McDowell (1953–2018), cellist and composer, whose
program and ideas FrakMC studies with gratitude and respect. Thanks also to Tim Conrardy, whose
*Tim's Atari MIDI World* preserved the program and its manual. FrakMC uses the VT323 typeface
(SIL Open Font License).

# Provenance

## 1. What FrakMC is

FrakMC is an independent browser-based fractal music composition project inspired by and
informed by Hugh McDowell's Fractal Music Composer 2 for the Atari ST.

FrakMC is independently implemented and is not an official port or continuation of Fractal Music
Composer. It is not affiliated with or endorsed by Hugh McDowell or any historical publisher or
distributor of FMC/FMC2. The original FMC/FMC2 software, documentation and associated historical
materials are not distributed with FrakMC.

Fractal Music Composer and its ideas are Hugh McDowell's work. The names "Fractal Music Composer",
"FMC" and "FMC2" are used in FrakMC only to refer to that historical program — in research notes,
credits, and where FrakMC reads its file formats.

FMC2 was distributed as freeware around 2001. FrakMC does not treat that as placing the program,
its manual, its graphics or its data in the public domain.

## 2. How FrakMC was made

| Kind of knowledge | Where it came from | How it is used |
|---|---|---|
| Documented behaviour and workflow | The FMC2 manual, the author's tutorial text, reviews | Described in FrakMC's own words (RESEARCH.md, BEHAVIOUR.md); controls with the same function keep their short names. |
| Undocumented behaviour (how pixels become notes, lengths and loudness; scanning; scales; tonality timing; same-note rules; zoom; Julia generation) | Static examination of the freeware program, which was never executed | Written down as rules and formulae in BEHAVIOUR.md; FrakMC was implemented from that description. |
| File formats | Decoding the original data files | Described in BEHAVIOUR.md §11 for compatibility; implemented in `src/persistence/fmcFiles.ts`. |
| Implementation | Written for this project | All of `src/`, `test/`, `e2e/`, `index.html` and the docs. |
| Open questions and deliberate differences | — | UNCERTAINTIES.md. |

No original code was translated or copied. No source code, decompiled or reconstructed code,
assembly listings or binary dumps are included in this repository or its documentation, and the
analysis notes are not published. Numbers that a compatible implementation needs — the
fixed-point scale, the escape threshold, the constants of the standard 48-bit random generator,
the fixed Julia screen mapping, record layouts — are stated as facts of behaviour.

## 3. What is not in this repository

Research material is kept in `research-sources/`, which is listed in `.gitignore` and has never
been committed. It holds the FMC2 program, resource and data files, the manual PDF, the reviews
and working notes. Nothing in it is needed to build, run or test FrakMC. Two unit tests compare
FrakMC with the original plot and record files *when they are present on the developer's machine*
and are skipped otherwise; they contain no original data.

## 4. Provenance audit (October 2026)

Before publication the whole repository — code, UI, every screen and dialog, menus, help text,
documentation, screenshots, factory data, tests, file names, metadata and deployment
configuration — was audited for material derived from FMC2. Similarities were classified as:

- **A. Function / behaviour** — needed to reproduce FMC2's musical behaviour, algorithms, data
  formats or workflow. Kept.
- **B. Functionally informed interface** — organisation or terminology dictated by the model the
  user operates. Kept.
- **C. Expressive / presentational** — wording, decoration, distinctive visual treatment,
  branding or exact layout not needed for compatibility or understanding. Replaced with FrakMC's
  own.

### Kept (A and B)

| Item | Class | Reason |
|---|---|---|
| Fractal maths: fixed-point iteration, descending count, escape test, zoom rule, Julia inverse iteration and its random root choice | A | These *are* the behaviour; FrakMC reproduces it exactly (plots match bit for bit). |
| Fractal → music rules: box scanning, note table, scale-pattern offsets, transpositions, rhythm (DUR/SEQ, N.REPS, multipliers), velocity, REP/TIE/RST, tonality timing, PPQN effect | A | The musical model being studied. |
| FMC2 file-format readers (plots, set-ups, rhythms, tonalities, scale sets) and `.SCA` writing | A | Lets people use their own FMC2 files. No FMC2 files are bundled. |
| The workflow: track table, note box + duration box per track, set coordinates by dragging, right-button examine, F-keys to reuse boxes, undo, compose / stop / replay, eight set-up slots per screen | B | How the model is operated. |
| Control names: TRACKS, CHAN, S.O, REP/TIE/RST, D, M, LO/HI, DUR/SEQ, N.REPS, RHYTHM MAP, TONALITY MAP, SET COORDINATES, COMPOSE!, REPLAY, SAVE MIDI-FILE, PPQN, CLOCK, SAVE/RECALL | B | Short functional names that let FrakMC's docs and the historical record describe the same controls. |
| Left button decreases, right button increases (swappable) | B | Part of how values are edited in the studied workflow. |
| The analyser's grid of channel, message-type and other-data boxes | B | It *is* the display of a file's contents. |
| A general GEM look: 1-pixel outlines, inverted selection, shadowed buttons, alert boxes, a 640×400 screen, the ST 0–7 colour levels | B / generic | Conventions of the Atari GEM environment, not specific to FMC2. |
| Showing the current plot behind the dialogs | A / B | The plot is the material the composer reads. |

### Replaced (C)

| Item found | Replacement |
|---|---|
| The recreation called itself "FRACTAL MUSIC COMPOSER" (start-up screen, About box, page title, metadata) | FrakMC / FRAKMC throughout. |
| Start-up screen reproducing FMC2's layout, title box and wording | FrakMC's own launcher: title bar, wordmark, a fractal emblem computed live by FrakMC, three tiles, options row. |
| Dialog titles in FMC2's decorative style ("++ … ++", "* * … * *", dithered ends) | GEM-window-style striped title bars with FrakMC's own titles (COMPOSER, RHYTHM MAP, TONALITY MAP, SCALE PATTERN, PROGRAM CHANGE, MIDI FILE ANALYSER, EXPLORE). |
| Dialogs placed at the pixel positions of the original resource files | FrakMC's own layouts around the functional grids. |
| Alert and prompt texts copied verbatim from the program (about a dozen) | Reworded in FrakMC's voice with the same functions. |
| Decorative label framings ("*** LO ***", "*SAME-NOTE MODE*", ">>" arrows, dashed headers) | Plain headings and grouped frames with captions. |
| The analyser's help text | Written afresh. |
| A quotation from the author in the About box | Removed; replaced by the attribution statement and a short description. |
| Factory set-up values taken from manual screenshots; a rhythm and a tonality cycle matching the original's first slots | FrakMC's own set-ups, rhythm maps and tonality maps (4/4, on FrakMC's default plot). |
| Factory scale set using FMC2's names and order | FrakMC's own twelve patterns and names (MAJOR, MINOR, DOMINANT, DIMINISH, WHOLETONE, PENTATONE, MAJ HOLD, MIN HOLD, DORIAN, LYDIAN, SPARSE, CHROMATIC), generated by FrakMC's own rule. |
| Default plot using the window numbers of FMC2's distributed full-set plot | FrakMC's `FULLSET` window (−2.25…+0.75 × −1.5…+1.5i). |
| Program addresses and internal details in the docs | Removed; behaviour described in prose and FrakMC's own pseudo-code. |
| Quotations from reviews and the manual in the docs | Paraphrased. |
| Code identifiers and storage names using "fmc" for the product (`window.fmc`, `fmc.` storage keys, `.fmc.json`, `fmc-document`) | `frakmc`. Identifiers that refer to FMC2's *behaviour* or *file formats* (`fmcCount`, `fmcFiles.ts`) keep the historical name. |

### Checked and found clean

Fonts (VT323, SIL Open Font License, bundled through `@fontsource/vt323`), the favicon (an SVG
drawn for FrakMC), CSS, icons, the fractal images (all computed by FrakMC at run time),
screenshots in `docs/images` (all captured from FrakMC by `npm run e2e`), test fixtures
(synthetic), package metadata and the Pages workflow.

## 5. Factory content

- **Scale patterns** — twelve patterns named and chosen for FrakMC, each row generated by
  snapping every chromatic note to the nearest pitch of a chosen set (`snapRow` in
  `src/music/factory.ts`). The general idea — fewer, wider-spaced notes for low tracks and fuller
  scales higher up, optional hold/rest cells — follows the manual's description; the patterns,
  names and order are FrakMC's.
- **Set-ups, rhythm maps, tonality maps** — written for FrakMC (a quartet-and-kit set-up in 4/4,
  a slower four-voice set-up, a Julia set-up), with boxes placed on FrakMC's default plot by
  measuring local variety.
- **Default plot** — `FULLSET`, chosen for FrakMC.
- No compositions, plots, set-ups or scale sets from FMC2 are bundled.

## 6. Sources consulted (not distributed)

| Item | Location at the time of research | Use |
|---|---|---|
| FMC2 manual (PDF compiled by Tim Conrardy and Trond Einar Garmo) | https://exxosforum.co.uk/atari/mirror/tamw/fmc2.pdf | Documentation, screenshots |
| FMC2 freeware distribution | https://exxosforum.co.uk/atari/mirror/tamw/fmc2.zip | Tutorial text; static examination; file formats |
| Tim's Atari MIDI World — FMC page | https://exxosforum.co.uk/atari/mirror/tamw/fmc.htm | History and release notes |
| Martin Russ, "Fractal Action", *Sound On Sound*, Feb 1992 | https://www.muzines.co.uk/articles/fractal-action/9325 | Review of version 1 |
| Derek Johnson, *Sound On Sound* "Atari Notes", Jul 2000 | https://www.soundonsound.com/techniques/fractal-music-composer | Review of version 2 |
| Ian Waugh, "Fractal Music Software", *Music Technology*, Nov 1992 | https://www.muzines.co.uk/articles/fractal-music-software/2354 | Read and set aside (a different program) |

## 7. Dependencies

Build and test: TypeScript, Vite, Vitest, marked, puppeteer-core (MIT / Apache-2.0). Runtime:
`@fontsource/vt323` (OFL-1.1 font). FrakMC uses no runtime services, analytics, accounts or
remote storage.

## 8. Remaining provenance considerations

- FrakMC deliberately keeps FMC2's workflow and functional control names (class B). That is the
  point of a project studying the program, but it means FrakMC will look and work recognisably
  like a descendant of FMC2.
- The behaviour description in BEHAVIOUR.md was obtained partly by examining the program's
  machine code. It is published as rules, formulae and data layouts only.
- This audit is an engineering and provenance review, not legal advice.

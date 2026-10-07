# Behaviour specification

What FrakMC implements, and the evidence for each rule. FrakMC is an independent project informed
by research into Hugh McDowell's Fractal Music Composer 2 (FMC2); this file describes FMC2's
behaviour **in FrakMC's own words, at the level of rules and formulae**, and says where FrakMC
deliberately differs.

Labels: **DOCUMENTED** (FMC2 manual, tutorial, reviews), **OBSERVED** (established from the
original program or its data files by static examination, or from manual screenshots),
**INFERRED**, **UNKNOWN** (approximated — see [UNCERTAINTIES.md](UNCERTAINTIES.md)). Pseudo-code
below is FrakMC's own notation for the behaviour, not a transcription of the original program.

"FrakMC:" notes name the module that implements a rule or a deliberate difference.

---

## 1. Program structure

| FMC2 part | FMC2 | FrakMC |
|---|---|---|
| Start-up screen | chooses the three programs; information; mouse-button swap; disk drive; quit. **DOCUMENTED** | Its own launcher: COMPOSE, EXPLORE, MIDI FILES; display and mouse options; About; Help. |
| Mandelbrot zoom | view saved plots, zoom with 72/144/288 iterations, auto-save, print. **DOCUMENTED** | EXPLORE: browse saved plots and zoom; no printing. |
| Composer | main screen plus rhythm, tonality, scale and patch screens; set coordinates; compose. **DOCUMENTED** | COMPOSER with RHYTHM MAP, TONALITY MAP, SCALE PATTERN and PROGRAM CHANGE screens. |
| MIDI-file player/converter | load, play, mute, filter, convert, save. **DOCUMENTED** | MIDI FILE ANALYSER with the same functions. |

## 2. Fractal engine (`src/fractal/`)

### 2.1 Number format — **OBSERVED** (plot fit)

- Coordinates and the iteration state are signed 32-bit integers with **27 fraction bits**
  (1.0 = 2²⁷ = 134 217 728).
- `mul(a, b)` = the signed 64-bit product shifted right by 27, keeping the low 32 bits
  (two's-complement wrap). Implemented exactly in `fixed.ts`.
- Additions wrap at 32 bits.

### 2.2 Mandelbrot iteration — **OBSERVED**

```
x = y = x2 = y2 = 0
for n = maxIter-1 down to 0:
    t  = x2 - y2 + cr
    y  = 2·mul(x, y) + ci        (the product is formed before x is replaced)
    x  = t
    x2 = mul(x, x);  y2 = mul(y, y)
    if (x2 + y2) as unsigned 32-bit > 0x20000000: return n + 1
return 0
```

So the **FMC count** is `maxIter − i` for a point escaping at 0-based iteration `i` (72 for a
point that escapes immediately at 72 iterations) and **0 for points that never escape**.
`maxIter` is 72, 144 or 288. **OBSERVED**.

### 2.3 Plots — **OBSERVED**

- A plot is a 640 × 400 raster (ST high resolution) with header `y0, dy, x0, dx` (Q27) and an
  iteration count. Pixel (col, row) has c = (x0 + col·dx, y0 + row·dy). Rows grow towards
  positive imaginary values; the image is not flipped.
- FMC2's standard plot shows the whole set, roughly −2.01…+0.66 by −1.12…+1.12i. **OBSERVED**.
  FrakMC: its own default plot, `FULLSET`, covers −2.25…+0.75 by −1.5…+1.5i — chosen so that it
  coincides with the fixed screen-to-c mapping of Julia mode (§2.5). *(Deliberate difference.)*
- Display colour: pen = (10 − k) mod N, where k = maxIter − count + 1 for escaping points and
  k = maxIter + 1 for points in the set; N = 2 (mono) or 4 (colour). Pens map to palette
  registers as GEM does (VDI pen 1 is black in mono; in 4-colour mode VDI pens 0,1,2,3 are
  registers 0,3,1,2).
- FrakMC computes plots in a Web Worker (`plot.worker.ts`), progressively, and keeps
  only the header in documents — the raster is recomputed deterministically.
- FMC2 also had 640×200 (4-colour) and 320×200 (16-colour) plots. FrakMC uses
  one geometry (640×400) and offers the 4-colour look as a display option. **INFERRED** choice.

### 2.4 Zoom — **OBSERVED**

Given the dragged box (left, top)–(left+w, top+h) on an H×W plot:
```
yEnd = y0 + H·dy                     xEnd = x0 + W·dx
y0'  = trunc(y0 + (yEnd−y0)·top/H)    x0' = trunc(x0 + (xEnd−x0)·left/W)
yB   = y0 + (yEnd−y0)·bottom/H        xR  = x0 + (xEnd−x0)·right/W
dy'  = trunc((yB − y0')/H)            dx' = trunc((xR − x0')/W)
if dy' == 0 or dx' == 0: refuse (the zoom is too deep) and keep the old window
```
The box is free (not forced to the screen's shape); the manual asks for a "roughly
screen-shaped" box. Iterations are chosen per zoom (72/144/288). **DOCUMENTED**/**OBSERVED**.

### 2.5 Julia inverse iteration — **OBSERVED**

Per track (double precision):
```
w = z − c;  θ = atan(w.im / w.re) (+π if w.re < 0;  θ = 1.570796 if w.re == 0);  θ /= 2
r = sqrt(|w|);  if drand48() ≤ 0.5: r = −r
z = (r·cos θ, r·sin θ)
sx = trunc(48·z.re);   sy = trunc((2 − z.im)·Ys)
```
- Start z = 2 + 2i. 30 warm-up steps, then 40 steps recording max(sx) (start 0) and min(sx)
  (start 200).
- `R` = the track's range in semitones = (hiOct−loOct)·12 + hiNote − loNote.
- `k = (R + R/24) / (|min| + max)`, `off = trunc(|min| − R/24)`.
- Note index for each composed note = `trunc((sx + off)·k)`, negative → 0.
- `drand48`: X ← (0x5DEECE66D·X + 0xB) mod 2⁴⁸, result X/2⁴⁸. State starts at **0** at program
  start and is never reseeded. **OBSERVED**.
- c from a click at pixel (px, py): c = (−2.25 + 3·px/640, −1.5 + 3·py/400). **OBSERVED**. The
  FrakMC uses this mapping by default and offers "use plot coordinates" as an option.
- `Ys` (vertical scale) and the velocity shift are not set by any instruction found; the
  FrakMC uses Ys = 50 and shift 2 for the 640×400 screen, which keeps the patterns inside
  six 213×200 panes and gives velocities 30–130 before smoothing. **UNKNOWN** → approximated.
- Panes: the compose screen is divided by a horizontal line at y = 200 and vertical lines at
  x = 213 and 427. **OBSERVED**. Pattern origin inside each pane: **INFERRED** (centre-left of the
  pane so the ±96-pixel-wide pattern fits).

## 3. Tracks (`src/music/`) — DOCUMENTED + OBSERVED (`COMPSET.REC`)

Up to **6 tracks**. Each track has:

| Field | Range | Notes |
|---|---|---|
| CHAN | 1–16 | MIDI channel. |
| lo OCT+NOTE | oct 1–8, note 0–11 | Low limit. MIDI note = 12·oct + note (oct 5 note 0 = 60). |
| hi OCT+NOTE | same | High limit. |
| S.O | 1–6 | Scale-base octave: which scale-pattern row the track's low octave reads. |
| SAME-NOTE MODE | REP / TIE / RST | Repeated notes re-struck / held / silent. |
| D | on/off | Disable tonality: no scale pattern, no transposition. |
| M | on/off | Mute: track is not composed (and not written to the file). |

TRACKS (1–6) sets how many are used. LO / HI buttons play the range limits. **DOCUMENTED**.

## 4. Coordinates (Set Coordinates) — DOCUMENTED + OBSERVED

- On entry, existing coordinates may be kept or redrawn. If the set-up's plot name doesn't match
  the loaded plot, new coordinates are required. **DOCUMENTED**.
- **Mandelbrot**: two boxes per track, dragged with the left button, in the order track 1 notes,
  track 1 durations, track 2 notes, … A prompt names the box being drawn and its function key:
  box k (k = 2n−1 for notes, 2n for durations) can be reused later by pressing Fk instead of
  dragging, and a note box may be used as a duration box. **DOCUMENTED**.
- Holding the **right button** shows what the pixel under the pointer would give for the current
  box — the note (from the note table and the track's low octave) or the duration value —
  ignoring scales and transposition. **DOCUMENTED** + **OBSERVED**. FrakMC's wording:
  `TRACK n  NOTE D  OCTAVE 4`, `TRACK n  LENGTH 12`, plus the count.
 .
- **UNDO** steps back one box. **DOCUMENTED**. (FrakMC: Backspace or the UNDO button.)
- **Julia**: one click per track (up to six) chooses c.
- When all boxes are set, the program returns to the Main screen and COMPOSE! is enabled.
- Loading another plot or changing FRACTAL TYPE disables COMPOSE! until coordinates are set
  again. **DOCUMENTED**. (The manual also asks for a visit to the rhythm editor; FrakMC enforces
  the substance — SEQ rhythms in Julia mode — instead of the visit. **INFERRED** simplification.)

## 5. Note generation — OBSERVED

### 5.1 Box scanning (Mandelbrot)

Each box keeps a scan position starting at its top-left. Each time the box is used:
1. compute the FMC count at the current pixel (§2.2) with the plot's own c and iterations;
2. redraw that pixel (colour `(count+1) & mask`) — the visible "recalculation";
3. move down one pixel; past the bottom, go to the top of the next column; past the right edge,
   go back to the top-left (and the box outline is redrawn).

Scan positions reset at every COMPOSE!. The note box is used once per note; the duration box
once per note in DUR mode (even during a REP run). Positions are per box, so tracks drift
against each other.

### 5.2 Note table

Per track, 144 entries, rebuilt from the range (lo = loNote, hi = (hiOct−loOct)·12 + hiNote):
- **Mandelbrot**: lo, lo+1, …, hi−1, hi, hi−1, …, lo+1, lo, lo+1, … (triangle wave).
- **Julia**: lo, lo+1, …, hi, hi, hi, … (rises then holds).
- If lo ≥ hi every entry is lo.

Index > 143 reflects: 143 − (index − 143). Indices that become negative (only possible with
288 iterations) read before the table; FrakMC reads the previous track's table end for
tracks 2–6 and 0 for track 1. **INFERRED** (memory layout).

### 5.3 Pitch

```
s = table[index]                                (semitones above the low octave's C)
if D (disable):  note = 12·loOct + s
else:
    p = 12·(S.O − 1) + s;  while p > 95: p −= 12
    v = scale[currentScale].offset[p]           (8 rows × 12 signed bytes)
    if v == 16: TIE         if v == 17: REST
    note = 12·loOct + s + v + tonalityTranspose + globalTranspose
while note > 127: note −= 12;   while note < 12: note += 12
```
**OBSERVED**. Scale pattern cells are *offsets from the chromatic note in that column* — the
Scale Editor shows the resulting note name (C … B, C+ for an octave above) or T* / R*.
**DOCUMENTED** + **OBSERVED**.

### 5.4 Scale patterns

12 patterns of 6 editable rows (S.O 1–6; stored as 8 rows of 12, name ≤ 9 characters). Cells
range from C to C+ of their row, plus T* (tie: keep the previous note sounding) and R* (rest).
FMC2's factory set covers major, dominant seventh, minor, diminished, whole-tone and chromatic
patterns, each in a plain version and a version with ties in the middle rows; low rows hold chord
tones and higher rows more scale tones. **DOCUMENTED** (names shown in the manual) + **OBSERVED**.
FrakMC ships its own set of twelve, generated for this project (PROVENANCE.md §5), and can load a
user's own `.SCA` file. Storing a pattern copies row 6 to the hidden rows 7–8 so the top row
carries on upwards, as the manual describes. **INFERRED**.

## 6. Rhythm — OBSERVED + DOCUMENTED

Per track: type **DUR** or **SEQ**, **N.REPS** (1–16, INFERRED), number of lengths **n** (1–16), and 16
lengths. All lengths are multiplied by **4, 8, 16 or 32** ("NOTE LENGTH MULTIPLY BY"), giving
MIDI ticks. With ×8 at 96 PPQN, 12 = quarter note (the manual's table). **DOCUMENTED**.

- **DUR**: index = count from the duration box; i = index mod n (index 0 → 0). The length is
  lengths[i]. If i = 0, a run starts: the same length is used for the next N.REPS − 1 notes too
  (the duration box keeps scanning during the run). **OBSERVED**.
- **SEQ**: lengths[0..n−1] are used in order and repeated; REP is ignored. **DOCUMENTED** +
  **OBSERVED**. Julia mode uses SEQ only. **DOCUMENTED**.

## 7. Velocity — OBSERVED

Let M1 = maxIter − 1 and s = 0/1/2 for 72/144/288 iterations.
- Mandelbrot note part: `v = ((M1 − noteCount) >> s) + 40`.
- Julia note part: `v = 2·(65 − (sy >> 2))`.
- Rhythm part: DUR adds `((M1 − durCount) >> s) + 40`; SEQ adds **100** when the sequence
  wraps back to its start and **70** otherwise (the very first note of a composition gets 70).
- Then `v = v >> 1`, `v = (v + prev) >> 1`, `prev = v` (prev starts at 64 per track).

So in Mandelbrot mode pixels inside or near the set are loud and distant ones soft, and changes
are smoothed. Velocities never exceed 127.

## 8. Same-note handling and MIDI events — OBSERVED

For each track that needs a new note, with `prev` = the last note started on this track:
- **Release**: if prev > 0, and the new value is not TIE, and not (new == prev and mode == TIE),
  send note-off for prev (`9n prev 00`).
- **Strike**: if new > 0 (not TIE/REST), and not (new == prev and mode ≠ REP), send note-on
  (`9n new v`) and set prev = new.

Effects: REP re-strikes repeats; TIE holds a repeated note; RST leaves a gap (and keeps silent
while the same note keeps coming); scale-pattern T* holds the previous note, R* releases it.

## 9. Time, tracks and tonality — OBSERVED + DOCUMENTED

- Composition advances in **steps**. Each track has a countdown in ticks. At each step every
  track whose countdown is 0 gets a new note (in track order: release, then strike) and its
  countdown is set to the new length. Then the smallest countdown is subtracted from all
  tracks, and that many ticks pass. Muted tracks never trigger.
- Ticks are converted to time with **PPQN** (96 or 192 ticks per quarter) and **TEMPO** (quarter
  notes per minute; FrakMC allows 20–300). Lengths are not
  rescaled for 192 PPQN, so everything plays twice as fast — the manual's "apparent tempo".
- **Tonality map**: NO. OF TONALITIES (1–36) triples of (scale 1–12, transpose −24…+24, quarter
  notes to wait). The map starts at tonality 1 at every COMPOSE! and cycles forever. Elapsed
  ticks are counted in real quarter notes (96 or 192 ticks); when the current tonality's quarter
  notes have passed, the next one applies from the next step. GLOBAL TRANSPOSE −12…+12 is added
  to every tonality. The current scale and transposition are shown as `SCALE nn TRANS+nn`.
- **Composition length** is unlimited in the full version (the demo stopped at ~2000 notes).
  FrakMC records up to 200 000 events.

## 10. Playback, MIDI and files

- **COMPOSE!** (or Return) asks for confirmation, then composes in real time while recording;
  **Space stops**. Composing replaces the composition in memory. **DOCUMENTED**.
- **REPLAY** plays the recorded file again at the current TEMPO. **DOCUMENTED**.
- **CLOCK**: sends `FA`, then `F8` 24 times per quarter note, and `FC` at stop. **OBSERVED**.
- **Patch change**: channel 1–16, program 1–128, sent as a program change; not stored in the
  MIDI file. **DOCUMENTED**. (FrakMC: PROGRAM CHANGE screen.)
- **SAVE MIDI-FILE**: Standard MIDI File, format 0 (one multi-channel track) or 1 (one track per
  composed track), division 96 or 192, each track starting with a text event (`FF 01`), ending
  with `FF 2F 00`. **OBSERVED**. FrakMC also writes a tempo event so files open at the
  composed tempo. *(Modern addition.)*
- **SAVE / RECALL** with 8 slots exist on the Main, Rhythm and Tonality screens; a Main set-up
  stores all main-screen values, the boxes, the plot name and the rhythm/tonality slot numbers.
  **DOCUMENTED** + **OBSERVED**.

## 11. Original file formats — OBSERVED

All big-endian 16-bit words.

- **COMPSET.REC**: 8 × 282 bytes. Per slot: 6 tracks × [chan, loOct, loNote, hiOct, hiNote,
  S.O, sameMode(0 REP,1 TIE,2 RST), disable, mute]; 12 boxes × [x1, y1, x2, y2]; 6 Julia points
  × [x, y, x, y]; tracks; fractalType (0 Julia, 1 Mandelbrot); ppqnIndex; midiType; tempo;
  rhythmSlot; tonalitySlot; plot name (14 bytes); 2 further words.
- **RHYTHMS.REC**: 8 × 230 bytes. Per slot: 6 × [type(0 DUR,1 SEQ), N.REPS, n, 16 lengths];
  multiplier index (0–3 → ×4…×32).
- **TONALITY.REC**: 8 × 220 bytes. Per slot: 36 scale numbers, 36 transposes, 36 quarter-note
  counts, number of tonalities, global transpose.
- **SCALESET.SCA**: 12 × 106 bytes: 96 signed offsets (8 rows × 12) then a 10-byte name.
  16 = Tie, 17 = Rest.
- **\*.DMP**: 32 000-byte screen + 5 longs (y0, dy, x0, dx, resolution-related code).

FrakMC imports these formats (`src/persistence/fmcFiles.ts`) so people who have their own copies
of FMC2 data files can load their set-ups, scales and plots, and it can save scale sets in the
`.SCA` format. No FMC2 data files are distributed with FrakMC.

## 12. Display and controls

- FMC2: GEM dialogs over the fractal plot. **OBSERVED** (screenshots). FrakMC uses general
  GEM conventions (1-pixel outlines, inverted selections, shadowed buttons, striped window title
  bars) with its own layouts, wording and launcher; see PROVENANCE.md §4.
- Colours: FMC2 recommended user-set colours, ideally light on dark. **DOCUMENTED**. FrakMC: a
  Colours dialog with ST-style 0–7 levels per gun and presets.
- Mouse: left button = −, right button = +, swappable. **DOCUMENTED**. FrakMC also accepts the
  mouse wheel and arrow keys on a focused value *(modern addition)*.
- TEMPO can be typed. **DOCUMENTED**.

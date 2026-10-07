# Research notes: Fractal Music Composer 2

FrakMC is an independent browser-based project inspired by and informed by **Fractal Music
Composer 2** (FMC2), written by Hugh McDowell for the Atari ST (1993–94). This file records what
was found out about FMC2 and how. FrakMC's behaviour specification is in
[BEHAVIOUR.md](BEHAVIOUR.md), open questions are in [UNCERTAINTIES.md](UNCERTAINTIES.md), and
sources, rights and the provenance audit are in [PROVENANCE.md](PROVENANCE.md).

Claims are labelled by where they come from:

| Label | Meaning |
|---|---|
| **DOCUMENTED** | Stated in the FMC2 manual, the author's tutorial text, or a contemporary review. |
| **OBSERVED** | Established from the original program or its data files: by examining the program statically (it was never run), by decoding its data files, or from the manual's screenshots. |
| **INFERRED** | Reasoned from documented or observed evidence, not shown directly. |
| **UNKNOWN** | Could not be established; FrakMC's choice is a documented approximation. |

---

## 1. The program and its author

- Hugh McDowell (1953–2018) was a cellist with the Electric Light Orchestra in the 1970s, later
  with Wizzard and the chamber group Quorum, and a music teacher. He wrote FMC in C and assembly
  language. **DOCUMENTED**.
- **Version 1** (reviewed in *Sound On Sound*, February 1992) was a suite of separate programs: a
  Mandelbrot composer, a Julia composer, a Mandelbrot zoom program and a MIDI file player.
  **DOCUMENTED**.
- **Version 2** (1993–94) combined them into one program with a start-up screen, a rhythm editor,
  a scale editor and a MIDI-file player/converter, for up to six tracks, with Standard MIDI File
  export and MIDI clock output. It was sold commercially. **DOCUMENTED**.
- Around 2001 a **freeware** build was distributed through *Tim's Atari MIDI World*, together with
  a manual compiled by Tim Conrardy from the printed one. **DOCUMENTED**. Being distributed as
  freeware does not make a program, its manual or its other material public domain: FMC2's
  copyright remains with its rights-holder(s), and FrakMC treats it that way (see
  PROVENANCE.md).
- Contemporary reception was positive. *Sound On Sound* (2000) found it stable and easy to follow,
  and good at producing hypnotic, melodic music that could mix busy repeating patterns with
  longer tunes; *Atari ST Review* is reported to have scored it 90%. **DOCUMENTED**.
- A different program, Datamusic's *Fractal Music* (reviewed in *Music Technology*, 1991–92), is
  unrelated; its reviews were read and set aside.

## 2. Sources

In order of weight:

1. **The FMC2 manual** (compiled by Tim Conrardy and Trond Einar Garmo): a tutorial plus annotated
   screenshots of every screen.
2. **The author's tutorial text** from the demo/freeware disk.
3. **The freeware distribution**: the program, its GEM resource files, three set-up record files,
   a scale-pattern file, six saved plots and a desk accessory.
4. **Reviews**: Martin Russ, *SOS* February 1992 (version 1); Derek Johnson, *SOS* July 2000
   (version 2).
5. **Tim's Atari MIDI World** web page about FMC (history, release notes, display advice).

None of this material is part of FrakMC; it is kept outside the repository. URLs are listed in
PROVENANCE.md.

## 3. Method

The manual explains how to *operate* FMC2 but, as Martin Russ noted in 1992, not how the picture
is turned into music. To learn that, FrakMC's research went beyond the documentation:

1. **Documentation.** Every control, screen and claim in the manual, tutorial and reviews was
   listed.
2. **Plot files.** The saved plots were decoded (a screen image plus five numbers giving the
   window in the complex plane). Recomputing them under different hypotheses pinned down the
   number format, the escape test and the colouring rule.
3. **Static program analysis.** The program was disassembled and read — never executed — to find
   the parts the manual leaves out: how a pixel's escape count becomes a note, a length and a
   loudness; how boxes are scanned; how scale patterns, the tonality map and the rhythm map are
   applied; how repeated notes are handled; how time advances; how the zoom computes a new window;
   how Julia patterns are generated.
4. **Resource and data files.** The dialog definitions were decoded to identify which control each
   part of the program reads, and the record and scale files were decoded so their formats could
   be described for compatibility.
5. **Implementation from the description.** Each finding was written down as behaviour (formulae,
   order of operations, data layouts) in BEHAVIOUR.md, and FrakMC was written from that
   description. No program code was translated or copied, and the analysis notes and listings
   are not published.

## 4. Fractal mathematics — findings

- **Number format.** Coordinates and the iteration state are fixed-point numbers: 32-bit integers
  with 27 fractional bits. Products are formed at full precision and then shifted and truncated to
  32 bits, so very large values wrap round. **OBSERVED**.
- **The iteration.** z ← z² + c from z = 0; a point escapes when |z|² > 4. **OBSERVED**.
- **Count direction.** The routine counts *down*: a point that escapes at once gets the maximum
  count, a point that never escapes gets 0. This is why, as the manual says, the black area inside
  the set always gives a track's lowest note and first duration. **OBSERVED** + **DOCUMENTED**.
- **Verification.** FrakMC's implementation of these rules recomputes all three of the original
  high-resolution plots with **no differing pixels** (256 000 each) at 72 iterations. A test
  repeats the comparison when the research files are present locally.
- **Iterations** per plot: 72, 144 or 288. **DOCUMENTED**.
- **Colour.** Plots alternate colours by escape count (two colours in high resolution, four or
  sixteen in colour modes), with a fixed offset. **OBSERVED**.
- **Zoom.** A dragged box defines the new window; the new pixel step is truncated to an integer,
  and when it would become zero the program refuses to zoom further. **OBSERVED**. On an 8 MHz ST
  a plot took 10–30 minutes. **DOCUMENTED**.
- **Julia patterns** are not stored plots: they are drawn dot by dot while composing by *inverse
  iteration* (repeatedly taking a square root of z − c), in floating point. Which of the two roots
  to take is decided by a standard 48-bit pseudo-random generator that is never seeded, so this is
  the only randomness in FMC2 and Julia compositions differ from one Compose to the next.
  **OBSERVED**. The point clicked is turned into c by a fixed screen formula rather than by the
  loaded plot's coordinates — which is why the tutorial says Julia points only really match the
  standard full-set plot. **OBSERVED** + **DOCUMENTED**.

## 5. Fractal → music — findings

Details are in BEHAVIOUR.md §5–§9. In brief (**OBSERVED** unless marked):

- Each track has a **note box** and a **duration box** on the plot. **DOCUMENTED**.
- Each time a track needs a note, the next pixel of each box is **recomputed** (not read from the
  picture), scanning down each column and then across, and wrapping round. **OBSERVED**; the
  tutorial mentions that the pixels are being recalculated.
- **Pitch.** The count indexes a per-track table that climbs from the lowest to the highest note
  and back down (Mandelbrot), or climbs and stays at the top (Julia). The result passes through
  the current **scale pattern** — a table, for each octave row, of how far to move each chromatic
  note, with special values for "hold" and "rest" — then the tonality's transposition and the
  global transposition, and is folded into the MIDI range by octaves.
- **Length.** DUR mode picks one of the track's lengths from the duration box's count; picking the
  first length starts a run of equal notes (N.REPS). SEQ mode steps through the lengths in order.
  Lengths are multiplied by 4, 8, 16 or 32 and are MIDI ticks. **DOCUMENTED** + **OBSERVED**.
- **Loudness.** Pixels nearer the set give louder notes; the two boxes' contributions are
  combined, then averaged with the track's previous loudness. In Julia mode loudness comes from a
  dot's height. **OBSERVED** (Julia: **DOCUMENTED** in outline).
- **Repeated notes** are re-struck, held or silenced (REP/TIE/RST). **DOCUMENTED** + **OBSERVED**.
- **Tonality map.** A list of (scale, transposition, quarter notes) entries played in a cycle, timed
  in real quarter notes. **DOCUMENTED** + **OBSERVED**.
- **Time.** Tracks run independently; at each step the tracks that are due get new notes and time
  advances to the next due track. At 192 PPQN the same lengths play twice as fast, which the
  manual describes as an effect on the apparent tempo. **DOCUMENTED** + **OBSERVED**.

## 6. Interface — findings

From the manual's screenshots and the resource files (**OBSERVED**): a start-up screen choosing
the three programs; a main composer screen with a six-row track table (channel, low and high note
as octave + semitone, scale-base octave, same-note mode, tonality-disable, mute, and buttons to
audition the range); fractal-type and plot selection; rhythm and tonality editors; a scale editor
with six octave rows; a patch-change screen; set-up save/recall in eight slots per screen; and
the MIDI-file player/converter showing which channels and message types each track contains.
Values are changed with the mouse — left button down, right button up — and this can be swapped.
**DOCUMENTED**. The display was designed for ST high and medium resolution and was recommended
with user-set colours, ideally light-on-dark. **DOCUMENTED**.

FrakMC keeps this workflow and the control names that describe the model (TRACKS, CHAN, S.O,
REP/TIE/RST, DUR/SEQ, N.REPS, PPQN …) but has its own layout, window furniture, wording and
launcher — see PROVENANCE.md §4.

## 7. MIDI and files — findings

- Notes are sent as note-on, and note-on with velocity 0 for note-off. **OBSERVED**.
- MIDI files: format 0 or 1, 96 or 192 ticks per quarter, each track starting with a text event.
  No tempo event was found. **OBSERVED** / **INFERRED**.
- MIDI clock: start, 24 clocks per quarter note, stop. **OBSERVED**.
- Patch change sends a program change and is not stored in the MIDI file. **DOCUMENTED**.
- The set-up record, scale-pattern and plot file formats were decoded completely so FrakMC can
  import a user's own files (BEHAVIOUR.md §11). **OBSERVED**.

## 8. What this means for FrakMC

FMC2 is deterministic in Mandelbrot mode: the same plot, boxes and settings always give the same
piece. Its character comes from the escape-count banding around the set, which turns a scanned
box into slowly evolving runs of similar values; from the up-and-down note table, which turns
rising counts into rising-then-falling lines; from the scale patterns, which pull those lines onto
chord tones in the bass and scale tones higher up; from the tonality map's slow harmonic cycle;
and from loudness that grows towards the set. FrakMC reproduces these behaviours from the
researched description rather than from generic generative-music conventions.

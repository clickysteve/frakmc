# Uncertainties, approximations and deliberate differences

What could not be established about FMC2's behaviour from the manual, the reviews, its data files
or static examination of the program — and what FrakMC does instead. Each entry says where the
approximation lives so it can be replaced if better evidence turns up (for example by running the
original under an emulator and recording its MIDI output).

## Open questions

| # | Question | Status | What FrakMC does | Where |
|---|---|---|---|---|
| U1 | Julia vertical scale and the shift used for Julia velocity. The program reads these values, but the code that sets them was not found (they are probably filled in indirectly by the operating system's display calls). | UNKNOWN | Scale 50, shift 2 for the 640×400 screen: patterns fit six panes; velocities 30–130 before smoothing. | `src/fractal/julia.ts` `JULIA_Y_SCALE`, `JULIA_VEL_SHIFT` |
| U2 | Where each Julia pattern sits inside its pane (same cause as U1). | UNKNOWN | Centred horizontally; measured from the top of the pane. | `src/ui/screens/compose.ts` |
| U3 | Note-table look-ups before the first entry (only possible at 288 iterations). | INFERRED | Tracks 2–6 read the end of the previous track's table; track 1 reads 0. | `src/music/pitch.ts` `lookupTable` |
| U4 | Whether storing a scale pattern copies row 6 into the hidden rows 7–8. | INFERRED | It does, matching the manual's statement that the top row carries on upwards. Imported files keep their own rows 7–8. | `src/ui/screens/tonality.ts` (`ScaleScreen.write`) |
| U5 | Exact value ranges of N.REPS, lengths, tempo and quarter notes per tonality. | INFERRED | N.REPS 1–16; lengths 1–96; tempo 20–300; quarter notes 1–99; transposition −24…+24; global −12…+12. | `src/state/document.ts` `LIMITS` |
| U6 | Whether saved MIDI files carried a tempo event. None was found. | INFERRED (no) | FrakMC writes one by default so files open at the composed tempo; Options ▸ *Write tempo into MIDI files* turns it off. | `src/music/recording.ts` |
| U7 | The original's real-time timing (a coarse system timer, so a few ms of jitter, and unsteadiness with high-iteration plots). | DOCUMENTED (jitter) | Precise Web MIDI timestamps; the jitter is not reproduced. | `src/scheduler/scheduler.ts` |
| U8 | Length and velocity of the LO/HI audition notes. | UNKNOWN | 400 ms at velocity 100. | `src/app/app.ts` (`audition`) |
| U10 | Medium (640×200) and low (320×200) resolution plots. | DOCUMENTED | One 640×400 geometry with a 4-colour display option. Imported 200-line plots keep their complex window and are recomputed at 640×400, so boxes from medium-resolution set-ups land on slightly different points. | `src/persistence/fmcFiles.ts` |
| U11 | The fifth number stored with a plot (differs by resolution). | UNKNOWN | Read and ignored. | `src/persistence/fmcFiles.ts` |
| U12 | The last two words of a composer set-up record. | INFERRED | Ignored on import. | `src/persistence/fmcFiles.ts` |
| U13 | How recalculated pixels look while composing. In mono they are drawn in the same colour as the plot, so nothing visibly changes. | OBSERVED, adapted | FrakMC draws them the same way and adds a small cursor in each box so the scan is always visible. | `src/ui/plotView.ts` |
| U15 | Details of the MIDI-file player (help wording, how filtering interacts with conversion). | DOCUMENTED in outline | FrakMC's own implementation of the documented functions. | `src/ui/screens/player.ts` |

## Deliberate differences

FrakMC keeps FMC2's musical behaviour but differs on purpose in these places:

| # | FMC2 | FrakMC | Why |
|---|---|---|---|
| D1 | Its own start-up screen, dialog layouts, titles and wording. | FrakMC's own launcher, layouts, title bars and wording (control names kept). | Independent identity; see PROVENANCE.md §4. |
| D2 | Factory scale patterns, set-ups and plots on the original disk. | FrakMC's own scale set, set-ups, rhythm and tonality maps and default plot `FULLSET`. | Not copied; see PROVENANCE.md §5. |
| D3 | A visit to the rhythm editor is required after changing fractal type. | Only coordinates are required; Julia mode forces SEQ rhythms and says so. | Same effect with less friction. |
| D4 | Julia c from a fixed screen mapping. | Same by default; option to use the loaded plot's coordinates. | Makes zoomed plots usable in Julia mode. |
| D5 | MIDI files without a tempo event (U6). | Tempo event written by default. | Files open at the right speed. |
| D6 | Coarse real-time timing (U7). | Look-ahead scheduling with timestamps. | Reliable timing. |
| D7 | Notes shown as semitone numbers 0–11 in the track table. | Note names (C … B); the stored values are the same. | Readability. |
| D8 | Disk files for set-ups, scales and plots. | Browser storage, documents, JSON export; import of FMC2 formats; `.SCA` export. | No disks in a browser. |
| D9 | Up to ~2 000 notes in the demo; memory-limited in the full version. | Up to 200 000 recorded events. | A practical limit. |

## Verified by experiment

| Claim | How it was checked |
|---|---|
| Fixed-point format, escape test, 72 iterations, colouring | Recomputing the three high-resolution FMC2 plots from their stored windows gives identical images (0 differing pixels of 256 000 each). A unit test repeats the comparison when the research files are present locally; it is skipped otherwise. |
| Record formats | The decoded fields read back as sensible set-ups consistent with the set-ups the tutorial describes. |

## Needs real hardware

- Behaviour with specific synthesizers (program numbers 1–128 vs 0–127 on the receiving device,
  channel 10 drum maps).
- MIDI clock following by external sequencers and drum machines.
- Long-run timing with real interfaces (USB MIDI latency varies by device).
- Web MIDI permission was refused in both automated test browsers, so output to a physical
  device has been tested only with a simulated MIDI device.

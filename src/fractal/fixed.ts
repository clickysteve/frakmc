/**
 * Q5.27 fixed-point arithmetic giving bit-identical results to FMC2's.
 *
 * FMC2 holds plot coordinates and the Mandelbrot iteration state in signed 32-bit integers
 * with 27 fraction bits. Its multiply forms the full signed 64-bit product and keeps bits
 * 27..58 — i.e. (a·b) >> 27, wrapped to 32 bits. Overflow wraps silently, and that wrap is
 * part of the original's output, so it is reproduced here. See docs/BEHAVIOUR.md §2.1.
 */

export const FRAC_BITS = 27;
/** 1.0 in Q27 */
export const ONE = 1 << FRAC_BITS;

const TWO27 = 134217728;

/**
 * (a·b) >> 27 as a signed 32-bit integer, with the original's two's-complement wrap.
 *
 * The double product is within 2^9 of the exact 62-bit product, so ⌊product / 2^27⌋ is right
 * or out by one; the exact low 32 bits from Math.imul fix the last five bits and so pick the
 * right neighbour. Bit-exact (tested against BigInt) and fast enough for plotting.
 */
export function mulQ27(a: number, b: number): number {
  let q = Math.floor((a * b) / TWO27);
  const want = Math.imul(a, b) >>> 27;
  const d = (q - want) & 31;
  if (d === 1) q -= 1;
  else if (d === 31) q += 1;
  return q | 0;
}

/** Real number → Q27 (truncated toward zero, like the original's conversions). */
export function toQ27(v: number): number {
  return Math.trunc(v * ONE) | 0;
}

/** Q27 → real number. */
export function fromQ27(q: number): number {
  return q / ONE;
}

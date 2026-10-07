/**
 * The standard C library drand48 generator, as FMC2 uses it: X ← (0x5DEECE66D·X + 0xB) mod 2^48,
 * result X / 2^48. FMC2 never seeds it, so the state is 0 when the program starts and runs on
 * across compositions. It is used only to pick the ± root in Julia inverse iteration — the one
 * source of randomness in FMC2 (docs/BEHAVIOUR.md §2.5).
 */
const A = 0x5deece66dn;
const C = 0xbn;
const MASK = (1n << 48n) - 1n;
const SCALE = 2 ** 48;

export class Drand48 {
  private x: bigint;

  constructor(state: bigint | string = 0n) {
    this.x = typeof state === 'string' ? BigInt('0x' + (state || '0')) & MASK : state & MASK;
  }

  next(): number {
    this.x = (A * this.x + C) & MASK;
    return Number(this.x) / SCALE;
  }

  /** 48-bit state as 12 hex digits (for saving in documents). */
  get state(): string {
    return this.x.toString(16).padStart(12, '0');
  }

  set state(hex: string) {
    this.x = BigInt('0x' + (hex || '0')) & MASK;
  }

  clone(): Drand48 {
    return new Drand48(this.x);
  }
}

/** State at power-on of the original program. */
export const POWER_ON_STATE = '000000000000';

// A small seedable PRNG used as the `np.random` stand-in for the ported
// windowed search. Given a fixed seed the whole run is deterministic in-app;
// exact numerical parity with NumPy is neither attempted nor required.

/** mulberry32: fast 32-bit seedable generator. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;

  /** Seed with `seed`, or draw a random seed when `seed` is null/undefined. */
  constructor(seed?: number | null) {
    const s =
      seed === null || seed === undefined
        ? Math.floor(Math.random() * 0x100000000)
        : seed >>> 0;
    this.next = mulberry32(s);
  }

  /** Float in [0, 1). */
  random(): number {
    return this.next();
  }

  /** Integer in [low, high), matching `np.random.randint(low, high)`. */
  randInt(low: number, high: number): number {
    if (high <= low) return low;
    return low + Math.floor(this.next() * (high - low));
  }

  /** In-place Fisher-Yates shuffle (like `np.random.shuffle`). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.randInt(0, i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }
}

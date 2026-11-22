/** Cryptographically secure float in [0, 1). */
export function secureRandom(): number {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  // 53 bits of randomness, same construction as Math.random's precision.
  return (buf[0] * 2 ** 21 + (buf[1] >>> 11)) / 2 ** 53;
}

export type Rng = () => number;

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[], rng: Rng = secureRandom): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

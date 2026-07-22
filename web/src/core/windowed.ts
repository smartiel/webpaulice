// Port of qiskit_paulice/_internal/check_picking/windowed_search.py.
//
// The deterministic default check-picking strategy: for each target qubit,
// sample random windows of its wires, ask the decoder for a good check on each,
// and commit the lowest-cost candidate before moving to the next target.

import type { Circuit, Wire } from "../types.js";
import { Rng } from "./rng.js";
import type { Station } from "./station.js";

/** Progress callback fired once per target before its search begins. */
export type ProgressFn = (p: {
  index: number;
  total: number;
  target: number;
}) => void;

function sortWires(wires: Wire[]): Wire[] {
  return [...wires].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Randomized iterator over segments of `support` (mutates `support`). */
function* windowedIterator(
  support: Wire[],
  minSize0: number,
  maxSize0: number,
  numberOfWindows: number,
  ntries: number,
  rng: Rng,
): Generator<Wire[]> {
  const minSize = Math.max(minSize0, 3);
  const n = Math.max(numberOfWindows, 1);
  const maxSize = Math.min(maxSize0, Math.floor(support.length / n));
  if (maxSize < minSize) {
    if (support.length >= 3) yield sortWires(support);
    return;
  }
  let trials = 0;
  while (trials < ntries) {
    rng.shuffle(support);
    const actual: Wire[] = [];
    const windowSize = rng.randInt(minSize, maxSize + 1);
    let previousEnd = 0;
    for (let i = 0; i < numberOfWindows; i++) {
      const high = support.length - (numberOfWindows - i - 1) * windowSize;
      const startIndex = rng.randInt(previousEnd, high);
      const endIndex = startIndex + windowSize;
      previousEnd = endIndex;
      for (let k = startIndex; k < endIndex; k++) actual.push(support[k]);
    }
    if (actual.length >= 3) {
      yield sortWires(actual);
      trials++;
    }
  }
}

function getGoodChecksRandomized(
  support: Wire[],
  maxWidth: number,
  station: Station,
  ntries: number,
  paulis: number[] | null,
  rng: Rng,
): Array<[Station, number]> {
  const minS = Math.floor(0.15 * support.length);
  const maxS = Math.floor(maxWidth * support.length);
  const it1 = windowedIterator(support, minS, maxS, 2, Math.floor(ntries / 2), rng);
  const it2 = windowedIterator(support, minS, maxS, 1, Math.floor(ntries / 2), rng);
  const candidates: Array<[Station, number]> = [];
  for (const iter of [it1, it2]) {
    for (const actualSupport of iter) {
      const copy = station.copy();
      // Anchor the decoder's middle-wire choice from the same RNG stream.
      const rustSeed = rng.randInt(0, 0xffffffff);
      copy.setSupport(actualSupport, paulis ?? [1, 2, 3], rustSeed);
      const score = copy.findGoodCheck();
      if (score !== null) candidates.push([copy, score]);
    }
  }
  return candidates;
}

export interface WindowedResult {
  circuits: Circuit[];
  checkQubits: number[];
  virtualZs: number[][];
  costs: number[];
  committedTargets: number[];
}

export interface WindowedOptions {
  ntries?: number;
  maxWidth?: number;
  paulis?: number[] | null;
  seed?: number | null;
}

export function windowedCheckPicker(
  initial: Station,
  targets: number[],
  options: WindowedOptions = {},
  onProgress?: ProgressFn,
): WindowedResult {
  const { ntries = 30, maxWidth = 0.3, paulis = null, seed = null } = options;
  const rng = new Rng(seed);

  let station = initial;
  const circuits: Circuit[] = [station.getCircuit()];
  const costs: number[] = [station.getCurrentEnergy()];
  const committedTargets: number[] = [];

  for (let idx = 0; idx < targets.length; idx++) {
    const target = targets[idx];
    onProgress?.({ index: idx, total: targets.length, target });
    const support = station.getWires(target);
    const candidates = getGoodChecksRandomized(
      support,
      maxWidth,
      station,
      ntries,
      paulis,
      rng,
    );
    if (candidates.length === 0) continue; // no valid check on this target
    let best = candidates[0];
    for (const c of candidates) if (c[1] < best[1]) best = c;
    station = best[0];
    committedTargets.push(target);
    circuits.push(station.getCircuit());
    costs.push(station.getCurrentEnergy());
  }

  const { checkQubits, virtualZs } = station.getCheckData();
  return { circuits, checkQubits, virtualZs, costs, committedTargets };
}

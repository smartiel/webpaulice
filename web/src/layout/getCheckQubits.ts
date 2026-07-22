// Port of qiskit_paulice/layout.py (get_low_overhead_ancillas + get_check_qubits).
//
// Given a device coupling map and the physical qubits a payload occupies,
// pair each payload qubit with a neighboring free ancilla, using each target
// and ancilla at most once. Deterministic (sorted) selection.

import type { CouplingMap } from "../types.js";

/** Build an undirected adjacency map from a coupling map. */
export function adjacency(map: CouplingMap): Map<number, Set<number>> {
  const adj = new Map<number, Set<number>>();
  const add = (a: number, b: number) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const [a, b] of map) {
    add(a, b);
    add(b, a);
  }
  return adj;
}

/** Map each ancilla (qubit outside `layout`) to the layout qubits it borders. */
export function getLowOverheadAncillas(
  map: CouplingMap,
  layout: number[],
): Map<number, number[]> {
  const adj = adjacency(map);
  const layoutSet = new Set(layout);
  const ancillaTargets = new Map<number, number[]>();
  for (const qubit of layout) {
    const neighbors = [...(adj.get(qubit) ?? [])].sort((a, b) => a - b);
    for (const neighbor of neighbors) {
      if (!layoutSet.has(neighbor)) {
        if (!ancillaTargets.has(neighbor)) ancillaTargets.set(neighbor, []);
        ancillaTargets.get(neighbor)!.push(qubit);
      }
    }
  }
  return ancillaTargets;
}

export interface CheckQubits {
  /** Payload qubits that got paired with an ancilla, sorted. */
  targetQubits: number[];
  /** `ancillaQubits[i]` is the ancilla paired with `targetQubits[i]`. */
  ancillaQubits: number[];
}

/**
 * Pair layout qubits with neighboring ancillas, each used at most once.
 * Mirrors layout.get_check_qubits.
 */
export function getCheckQubits(map: CouplingMap, layout: number[]): CheckQubits {
  const ancillaTargets = getLowOverheadAncillas(map, layout);
  const matched = new Map<number, number>(); // target -> ancilla
  for (const ancilla of [...ancillaTargets.keys()].sort((a, b) => a - b)) {
    for (const target of [...ancillaTargets.get(ancilla)!].sort((a, b) => a - b)) {
      if (!matched.has(target)) {
        matched.set(target, ancilla);
        break;
      }
    }
  }
  const targetQubits = [...matched.keys()].sort((a, b) => a - b);
  return {
    targetQubits,
    ancillaQubits: targetQubits.map((t) => matched.get(t)!),
  };
}

// Random brickwork Clifford circuit generator (OpenQASM 2.0 output).
//
// Structure: H on every qubit, then `depth` brick layers. Each layer applies a
// CZ layer whose pairing alternates even/odd — even: (0,1),(2,3),…; odd:
// (1,2),(3,4),… — followed by a random single-qubit Clifford on every qubit,
// built as S · SX · S with each of the three gates included with probability
// 1/2. Ends with a measurement of every qubit.

import { Rng } from "../core/rng.js";

/**
 * Generate a random brickwork Clifford circuit as OpenQASM 2.0.
 *
 * @param nqubits number of qubits (>= 2, so CZ layers are non-empty)
 * @param depth   number of alternating CZ brick layers (>= 1)
 * @param seed    optional RNG seed for reproducibility (null = random)
 */
export function brickworkQasm(
  nqubits: number,
  depth: number,
  seed: number | null = null,
): string {
  if (!Number.isInteger(nqubits) || nqubits < 2) {
    throw new Error("Brickwork needs at least 2 qubits.");
  }
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error("Brickwork depth must be at least 1.");
  }

  const rng = new Rng(seed);
  const lines: string[] = [
    "OPENQASM 2.0;",
    'include "qelib1.inc";',
    `qreg q[${nqubits}];`,
    `creg c[${nqubits}];`,
  ];

  // Initial Hadamard layer.
  for (let q = 0; q < nqubits; q++) lines.push(`h q[${q}];`);

  for (let d = 0; d < depth; d++) {
    // Alternating CZ brick layer.
    const parity = d % 2;
    for (let i = parity; i + 1 < nqubits; i += 2) {
      lines.push(`cz q[${i}],q[${i + 1}];`);
    }
    // Random single-qubit Clifford (S · SX · S, each w.p. 1/2) on every qubit.
    for (let q = 0; q < nqubits; q++) {
      if (rng.random() < 0.5) lines.push(`s q[${q}];`);
      if (rng.random() < 0.5) lines.push(`sx q[${q}];`);
      if (rng.random() < 0.5) lines.push(`s q[${q}];`);
    }
  }

  // Terminal measurement.
  for (let q = 0; q < nqubits; q++) lines.push(`measure q[${q}] -> c[${q}];`);

  return lines.join("\n") + "\n";
}

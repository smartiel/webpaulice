// Build a layout file for the 3D circuit viewer (smartiel.github.io/3dcircuit).
//
// Format: one line per qubit, `q[i] x y`, where names match the QASM register
// (a single flat `q[...]` register, as emitted by qasm/export.ts). Payload
// qubits are placed at their device coordinate; each check ancilla is placed at
// the device coordinate of the hardware ancilla paired with its target (or,
// failing that, just off its target).

import type { CheckedVariant } from "../types.js";
import type { Coords } from "./couplingMaps.js";

/**
 * @param variant     the picker output variant to visualize
 * @param coords      device `[row, col]` coordinates, or null (no fixed layout)
 * @param ancByTarget map from target qubit -> suggested hardware ancilla index
 */
export function buildViewerLayout(
  variant: CheckedVariant,
  coords: Coords | null,
  ancByTarget: Map<number, number>,
): string {
  const nPayload = variant.circuit.nqubits - variant.checkQubits.length;

  // Device x/y for a qubit index (x = column, y = row), or a line fallback.
  const xy = (i: number): [number, number] =>
    coords && i < coords.length ? [coords[i][1], coords[i][0]] : [i, 0];

  const lines: string[] = [];

  for (let i = 0; i < nPayload; i++) {
    const [x, y] = xy(i);
    lines.push(`q[${i}] ${x} ${y}`);
  }

  for (let j = 0; j < variant.checkQubits.length; j++) {
    const q = variant.checkQubits[j]; // ancilla index in the output circuit
    const target = variant.targetQubits[j];
    const physAnc = ancByTarget.get(target);
    let x: number;
    let y: number;
    if (physAnc !== undefined && coords && physAnc < coords.length) {
      [x, y] = [coords[physAnc][1], coords[physAnc][0]];
    } else {
      const [tx, ty] = xy(target);
      x = tx + 0.5;
      y = ty + 0.5;
    }
    lines.push(`q[${q}] ${x} ${y}`);
  }

  return lines.join("\n") + "\n";
}

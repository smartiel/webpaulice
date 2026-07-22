// Port of qiskit_paulice/_internal/conversion.py.
//
// The picker consumes and emits circuits in rustiq's Clifford gate list form.
// `convertToRustiq` turns the parsed (qiskit-style) circuit into the gate names
// rustiq's `CliffordGate::from_vec` accepts (H, S, Sd, SqrtX, SqrtXd, CX, CZ),
// decomposing X/Z/rz into those. `convertToInternal` maps rustiq's `to_vec`
// output (CNOT, CZ, H, S, Sd, SqrtX, SqrtXd) back to qiskit-style names for
// display and QASM export.

import type { Circuit, Gate, RustiqGate } from "../types.js";

const NAMES: Record<string, string> = {
  cx: "CX",
  cz: "CZ",
  h: "H",
  s: "S",
  sdg: "Sd",
  sxdg: "SqrtXd",
  sx: "SqrtX",
  x: "X",
  z: "Z",
  rz: "RZ",
  u1: "RZ",
  id: "I",
};

/** Gate names accepted from a parsed circuit (Clifford basis + directives). */
export const SUPPORTED_INPUT_GATES = new Set([
  ...Object.keys(NAMES),
  "measure",
  "barrier",
]);

const TWO_PI = 2 * Math.PI;
const CLOSE = 1e-9;

function isClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= CLOSE + 1e-6 * Math.abs(b);
}

/** Convert a parsed circuit into rustiq's Clifford gate list. */
export function convertToRustiq(circuit: Circuit): RustiqGate[] {
  const out: RustiqGate[] = [];
  for (const gate of circuit.gates) {
    const name = gate.name.toLowerCase();
    if (name === "measure" || name === "barrier") continue;
    const rust = NAMES[name];
    if (rust === undefined) {
      throw new Error(
        `Unsupported gate "${gate.name}". The check picker only handles Clifford ` +
          `circuits (h, s, sdg, sx, sxdg, x, z, cx, cz, and Clifford-angle rz).`,
      );
    }
    const q = gate.qubits;
    if (rust === "RZ") {
      let param = gate.params?.[0] ?? 0;
      param = ((param % TWO_PI) + TWO_PI) % TWO_PI;
      if (isClose(param, 0) || isClose(param, TWO_PI)) continue;
      if (isClose(param, Math.PI / 2)) {
        out.push(["S", q]);
      } else if (isClose(param, Math.PI)) {
        out.push(["S", q], ["S", q]);
      } else if (isClose(param, (3 * Math.PI) / 2)) {
        out.push(["Sd", q]);
      } else {
        throw new Error(
          `Non-Clifford rz(${gate.params?.[0]}) is not supported; only angles that ` +
            `are multiples of π/2 are allowed.`,
        );
      }
    } else if (rust === "I") {
      continue;
    } else if (rust === "X") {
      out.push(["SqrtX", q], ["SqrtX", q]);
    } else if (rust === "Z") {
      out.push(["S", q], ["S", q]);
    } else {
      out.push([rust, q]);
    }
  }
  return out;
}

const RUSTIQ_TO_QISKIT: Record<string, string> = {
  H: "h",
  CNOT: "cx",
  CZ: "cz",
  S: "s",
  SqrtX: "sx",
  Sd: "sdg",
  SqrtXd: "sxdg",
};

/** Rebuild an internal circuit (no measures) from a rustiq gate list. */
export function convertToInternal(
  rustiqGates: RustiqGate[],
  nqubits: number,
): Circuit {
  const gates: Gate[] = rustiqGates.map(([name, qubits]) => {
    const qk = RUSTIQ_TO_QISKIT[name];
    if (qk === undefined) throw new Error(`Unknown rustiq gate "${name}"`);
    return { name: qk, qubits };
  });
  return { nqubits, gates, measures: [], cregs: [] };
}

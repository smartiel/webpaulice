// Serialize an internal Circuit back to OpenQASM 2.0 for download.

import type { Circuit } from "../types.js";

/** Emit OpenQASM 2.0 text for a circuit (single flat qreg named `q`). */
export function toQasm(circuit: Circuit): string {
  const lines: string[] = ["OPENQASM 2.0;", 'include "qelib1.inc";'];
  lines.push(`qreg q[${circuit.nqubits}];`);
  for (const creg of circuit.cregs) {
    lines.push(`creg ${creg.name}[${creg.size}];`);
  }
  for (const g of circuit.gates) {
    const args = g.qubits.map((q) => `q[${q}]`).join(",");
    const params = g.params && g.params.length ? `(${g.params.join(",")})` : "";
    lines.push(`${g.name}${params} ${args};`);
  }
  for (const m of circuit.measures) {
    lines.push(`measure q[${m.qubit}] -> ${m.creg}[${m.bit}];`);
  }
  return lines.join("\n") + "\n";
}

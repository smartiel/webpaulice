// End-to-end test of the real wasm core + TS orchestration, run headlessly in
// Node via `initSync` (no browser fetch). Requires `npm run wasm` to have built
// src/wasm/ first.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initSync } from "../wasm/paulice.js";
import { parseQasm } from "../qasm/parse.js";
import { pickChecks } from "./pickChecks.js";
import { toQasm } from "../qasm/export.js";
import type { NoiseParam } from "../types.js";

const QASM = `OPENQASM 2.0;
include "qelib1.inc";
qreg q[5];
creg c[5];
h q[0]; h q[1]; h q[2]; h q[3]; h q[4];
cx q[0],q[1]; cx q[2],q[3];
cx q[1],q[2]; cx q[3],q[4];
s q[0]; s q[2];
cx q[0],q[1]; cx q[2],q[3];
cx q[1],q[2]; cx q[3],q[4];
measure q[0] -> c[0];
measure q[1] -> c[1];
measure q[2] -> c[2];
measure q[3] -> c[3];
measure q[4] -> c[4];`;

beforeAll(() => {
  const wasmPath = fileURLToPath(new URL("../wasm/paulice_bg.wasm", import.meta.url));
  initSync({ module: readFileSync(wasmPath) });
});

describe("pickChecks (wasm e2e)", () => {
  it("finds checks on a small Clifford circuit", () => {
    const circuit = parseQasm(QASM);
    const noise: NoiseParam[] = [{ kind: "uniform_depolarizing", rate: 0.001 }];
    const result = pickChecks(circuit, [1, 2, 3], noise, { seed: 42, ntries: 20 });

    // Always at least the bare variant.
    expect(result.variants.length).toBeGreaterThanOrEqual(1);
    // Some checks were committed on this reasonably deep circuit.
    expect(result.committedTargets.length).toBeGreaterThan(0);

    // Costs are finite numbers.
    for (const v of result.variants) {
      expect(Number.isFinite(v.cost)).toBe(true);
    }

    // The final variant has extra ancilla qubits and a check register.
    const last = result.variants[result.variants.length - 1];
    expect(last.circuit.nqubits).toBe(5 + last.checkQubits.length);
    expect(last.checkQubits.length).toBe(result.committedTargets.length);
    expect(last.circuit.cregs.some((c) => c.name === "checks_c")).toBe(true);

    // Output QASM round-trips through the parser.
    const reparsed = parseQasm(toQasm(last.circuit));
    expect(reparsed.nqubits).toBe(last.circuit.nqubits);
  });

  it("runs in stabilizer mode (all-Z input stabilizers)", () => {
    const circuit = parseQasm(QASM);
    const noise: NoiseParam[] = [{ kind: "uniform_depolarizing", rate: 0.001 }];
    const result = pickChecks(circuit, [1, 2, 3], noise, {
      seed: 42,
      ntries: 20,
      useStabilizers: true,
    });
    expect(result.variants.length).toBeGreaterThanOrEqual(1);
    for (const v of result.variants) expect(Number.isFinite(v.cost)).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    const circuit = parseQasm(QASM);
    const noise: NoiseParam[] = [{ kind: "uniform_depolarizing", rate: 0.001 }];
    const a = pickChecks(circuit, [1, 2, 3], noise, { seed: 7, ntries: 15 });
    const b = pickChecks(circuit, [1, 2, 3], noise, { seed: 7, ntries: 15 });
    expect(a.variants.map((v) => v.cost)).toEqual(b.variants.map((v) => v.cost));
    expect(a.committedTargets).toEqual(b.committedTargets);
  });
});

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

  it("does not crash the wasm deserializer on windows that exceed the support", () => {
    // Regression: windowedIterator used to read past the support array (Python
    // slicing clamps, the TS index loop did not), injecting `undefined` wires
    // that made set_support throw "Reflect.get called on non-object". This
    // (nq=4, depth=9, seed=6) case reproduced it reliably.
    const circuit = parseQasm(
      `OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[4];\ncreg c[4];\n` +
        Array.from({ length: 4 }, (_, q) => `h q[${q}];`).join("\n") +
        "\n" +
        // a few brick layers so windows are large enough to overrun
        "cz q[0],q[1];\ncz q[2],q[3];\ns q[0];\nsx q[1];\ncz q[1],q[2];\ns q[2];\n" +
        "cz q[0],q[1];\ncz q[2],q[3];\nsx q[0];\ns q[3];\ncz q[1],q[2];\n" +
        Array.from({ length: 4 }, (_, q) => `measure q[${q}] -> c[${q}];`).join("\n"),
    );
    const noise: NoiseParam[] = [{ kind: "uniform_depolarizing", rate: 0.003 }];
    for (let seed = 0; seed < 25; seed++) {
      expect(() => pickChecks(circuit, [1, 2, 3], noise, { seed, ntries: 14 })).not.toThrow();
    }
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

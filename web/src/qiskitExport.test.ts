import { describe, it, expect } from "vitest";
import { toQiskitCode } from "./qiskitExport.js";

const base = {
  qasm: 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\ncreg c[3];\nh q[0];\ncx q[0],q[1];\nmeasure q[0]->c[0];\n',
  edges: [
    [0, 1],
    [1, 2],
  ] as [number, number][],
  targets: [1, 2],
  depol: 0.001,
  readout: 0,
  seed: 42,
  ntries: 30,
  useStabilizers: false,
};

describe("toQiskitCode", () => {
  it("emits a runnable add_pauli_checks script", () => {
    const code = toQiskitCode(base);
    expect(code).toContain("from qiskit_paulice import add_pauli_checks");
    expect(code).toContain("qiskit.qasm2.loads(qasm)");
    expect(code).toContain("CouplingMap([\n    [0, 1], [1, 2],\n]");
    expect(code).toContain("NoiseModel(gate_noise=0.001)");
    expect(code).toContain("target_qubits = [1, 2]");
    expect(code).toContain('cost="gamma"');
    expect(code).toContain('method="windowed"');
    expect(code).toContain("seed=42,");
    expect(code).toContain("get_check_qubits(coupling_map, layout)");
  });

  it("includes readout noise only when positive, and None seed", () => {
    const withReadout = toQiskitCode({ ...base, readout: 0.02, seed: null });
    expect(withReadout).toContain("NoiseModel(gate_noise=0.001, readout_noise=0.02)");
    expect(withReadout).toContain("seed=None,");
    // readout omitted when 0
    expect(toQiskitCode(base)).not.toContain("readout_noise");
  });

  it("notes stabilizer mode and non-default ntries", () => {
    const code = toQiskitCode({ ...base, useStabilizers: true, ntries: 50 });
    expect(code).toContain('stabilizers="all"');
    expect(code).toContain("ntries=50");
  });
});

import { describe, it, expect } from "vitest";
import { parseQasm } from "./parse.js";

describe("parseQasm", () => {
  it("parses a basic Clifford circuit", () => {
    const c = parseQasm(`OPENQASM 2.0;
include "qelib1.inc";
qreg q[3];
creg c[3];
h q[0];
cx q[0],q[1];
cz q[1],q[2];
measure q[0] -> c[0];`);
    expect(c.nqubits).toBe(3);
    expect(c.gates).toEqual([
      { name: "h", qubits: [0] },
      { name: "cx", qubits: [0, 1] },
      { name: "cz", qubits: [1, 2] },
    ]);
    expect(c.measures).toEqual([{ qubit: 0, creg: "c", bit: 0 }]);
    expect(c.cregs).toEqual([{ name: "c", size: 3 }]);
  });

  it("flattens multiple qregs into one index space", () => {
    const c = parseQasm(`qreg a[2];
qreg b[2];
cx a[1],b[0];`);
    expect(c.nqubits).toBe(4);
    expect(c.gates[0]).toEqual({ name: "cx", qubits: [1, 2] });
  });

  it("evaluates rz parameter expressions", () => {
    const c = parseQasm(`qreg q[1];
rz(pi/2) q[0];`);
    expect(c.gates[0].name).toBe("rz");
    expect(c.gates[0].params?.[0]).toBeCloseTo(Math.PI / 2, 12);
  });

  it("broadcasts register-wide single-qubit gates", () => {
    const c = parseQasm(`qreg q[3];
h q;`);
    expect(c.gates.map((g) => g.qubits[0])).toEqual([0, 1, 2]);
  });

  it("rejects custom gate definitions", () => {
    expect(() => parseQasm(`gate foo a { h a; }\nqreg q[1];`)).toThrow(/gate/i);
  });

  it("rejects unsupported gates", () => {
    expect(() => parseQasm(`qreg q[1];\nt q[0];`)).toThrow(/Unsupported gate/);
  });
});

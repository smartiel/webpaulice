import { describe, it, expect } from "vitest";
import { convertToRustiq, convertToInternal } from "./convert.js";
import type { Circuit } from "../types.js";

function circ(gates: Circuit["gates"], nqubits = 2): Circuit {
  return { nqubits, gates, measures: [], cregs: [] };
}

describe("convertToRustiq", () => {
  it("maps Clifford gates to rustiq names", () => {
    const out = convertToRustiq(
      circ([
        { name: "h", qubits: [0] },
        { name: "cx", qubits: [0, 1] },
        { name: "sdg", qubits: [1] },
      ]),
    );
    expect(out).toEqual([
      ["H", [0]],
      ["CX", [0, 1]],
      ["Sd", [1]],
    ]);
  });

  it("decomposes x, z, and Clifford rz", () => {
    expect(convertToRustiq(circ([{ name: "x", qubits: [0] }], 1))).toEqual([
      ["SqrtX", [0]],
      ["SqrtX", [0]],
    ]);
    expect(convertToRustiq(circ([{ name: "z", qubits: [0] }], 1))).toEqual([
      ["S", [0]],
      ["S", [0]],
    ]);
    expect(
      convertToRustiq(circ([{ name: "rz", qubits: [0], params: [Math.PI] }], 1)),
    ).toEqual([
      ["S", [0]],
      ["S", [0]],
    ]);
  });

  it("skips identity and zero-angle rz", () => {
    expect(convertToRustiq(circ([{ name: "id", qubits: [0] }], 1))).toEqual([]);
    expect(
      convertToRustiq(circ([{ name: "rz", qubits: [0], params: [0] }], 1)),
    ).toEqual([]);
  });

  it("throws on non-Clifford rz", () => {
    expect(() =>
      convertToRustiq(circ([{ name: "rz", qubits: [0], params: [0.3] }], 1)),
    ).toThrow(/Non-Clifford/);
  });
});

describe("convertToInternal", () => {
  it("maps rustiq output names back to qiskit names", () => {
    const c = convertToInternal(
      [
        ["CNOT", [0, 1]],
        ["SqrtXd", [1]],
      ],
      2,
    );
    expect(c.gates).toEqual([
      { name: "cx", qubits: [0, 1] },
      { name: "sxdg", qubits: [1] },
    ]);
    expect(c.nqubits).toBe(2);
  });
});

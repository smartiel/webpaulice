import { describe, it, expect } from "vitest";
import { PRESETS, edgesFromCoords, numQubits } from "./couplingMaps.js";

describe("coupling map presets", () => {
  it("derives the exact IBM 27-qubit heavy-hex edges from coordinates", () => {
    const p = PRESETS.find((p) => p.id === "ibm_falcon_27")!;
    expect(p.coords.length).toBe(27);
    expect(numQubits(p.map)).toBe(27);
    // Known 27q heavy-hex edge list (undirected, canonical order).
    const expected = [
      [0, 1], [1, 2], [1, 4], [2, 3], [3, 5], [4, 7], [5, 8], [6, 7],
      [7, 10], [8, 9], [8, 11], [10, 12], [11, 14], [12, 13], [12, 15],
      [13, 14], [14, 16], [15, 18], [16, 19], [17, 18], [18, 21], [19, 20],
      [19, 22], [21, 23], [22, 25], [23, 24], [24, 25], [25, 26],
    ];
    const norm = (m: [number, number][]) =>
      m.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)).sort();
    expect(norm(p.map)).toEqual(norm(expected as [number, number][]));
  });

  it("has 127 qubits in the Eagle preset", () => {
    const p = PRESETS.find((p) => p.id === "ibm_eagle_127")!;
    expect(p.coords.length).toBe(127);
    expect(numQubits(p.map)).toBe(127);
    // Every qubit is coupled to at least one neighbor.
    const seen = new Set<number>();
    for (const [a, b] of p.map) {
      seen.add(a);
      seen.add(b);
    }
    expect(seen.size).toBe(127);
  });

  it("edgesFromCoords links only grid neighbors", () => {
    expect(edgesFromCoords([[0, 0], [0, 1], [0, 3]])).toEqual([[0, 1]]);
  });
});

import { describe, it, expect } from "vitest";
import {
  PRESETS,
  edgesFromCoords,
  numQubits,
  caterpillar,
  gridLayout,
} from "./couplingMaps.js";
import { getCheckQubits } from "./getCheckQubits.js";

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

describe("caterpillar", () => {
  it("builds a spine of n data qubits each with one ancilla leg", () => {
    const { coords, map } = caterpillar(4);
    expect(coords.length).toBe(8); // 4 data + 4 ancilla
    const key = (m: [number, number][]) =>
      m.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)).sort();
    expect(key(map)).toEqual(
      key([
        [0, 1], [1, 2], [2, 3], // spine line
        [0, 4], [1, 5], [2, 6], [3, 7], // data ↔ ancilla rungs
      ]),
    );
    // Legs are not connected to each other.
    expect(map.some(([a, b]) => a >= 4 && b >= 4)).toBe(false);
  });

  it("pairs each data qubit with its dedicated ancilla", () => {
    const { map } = caterpillar(4);
    // Data qubits are 0..3 (the payload/spine).
    const { targetQubits, ancillaQubits } = getCheckQubits(map, [0, 1, 2, 3]);
    expect(targetQubits).toEqual([0, 1, 2, 3]);
    expect(ancillaQubits).toEqual([4, 5, 6, 7]);
  });

  it("rejects degenerate sizes", () => {
    expect(() => caterpillar(0)).toThrow(/data qubit/);
  });
});

describe("gridLayout", () => {
  it("produces a rows×cols lattice", () => {
    const { coords, map } = gridLayout(2, 3);
    expect(coords.length).toBe(6);
    expect(numQubits(map)).toBe(6);
    // 2×3 grid: 7 edges (2 rows × 2 horiz + 3 cols × 1 vert = 4 + 3).
    expect(map.length).toBe(7);
  });

  it("rejects degenerate dimensions", () => {
    expect(() => gridLayout(0, 3)).toThrow(/positive/);
  });
});

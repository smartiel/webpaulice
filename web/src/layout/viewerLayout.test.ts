import { describe, it, expect } from "vitest";
import { buildViewerLayout } from "./viewerLayout.js";
import type { CheckedVariant } from "../types.js";

function variant(nqubits: number, checkQubits: number[], targetQubits: number[]): CheckedVariant {
  return {
    circuit: { nqubits, gates: [], measures: [], cregs: [] },
    targetQubits,
    checkQubits,
    checkSupport: [],
    cost: 1,
  };
}

describe("buildViewerLayout", () => {
  it("places payload qubits at device coords (x=col, y=row)", () => {
    // 3-qubit payload, no checks. coords are [row, col].
    const coords: [number, number][] = [
      [0, 0],
      [1, 2],
      [3, 1],
    ];
    const out = buildViewerLayout(variant(3, [], []), coords, new Map());
    expect(out.trim().split("\n")).toEqual(["q[0] 0 0", "q[1] 2 1", "q[2] 1 3"]);
  });

  it("places a check ancilla at its paired hardware ancilla's coord", () => {
    // payload 0..2 (indices), one check: output ancilla q[3], target 1, paired
    // to hardware ancilla index 4 which sits at [row 5, col 6].
    const coords: [number, number][] = [
      [0, 0], [0, 1], [0, 2], [9, 9], [5, 6],
    ];
    const v = variant(4, [3], [1]);
    const out = buildViewerLayout(v, coords, new Map([[1, 4]]));
    // last line is the ancilla q[3] at x=col=6, y=row=5.
    expect(out.trim().split("\n").at(-1)).toBe("q[3] 6 5");
  });

  it("offsets the ancilla near its target when no pairing/coords", () => {
    const v = variant(4, [3], [1]);
    const out = buildViewerLayout(v, null, new Map());
    // Fallback line layout: target 1 -> [1,0], ancilla offset by (0.5, 0.5).
    expect(out.trim().split("\n").at(-1)).toBe("q[3] 1.5 0.5");
  });
});

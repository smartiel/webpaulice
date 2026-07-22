import { describe, it, expect } from "vitest";
import { getCheckQubits, getLowOverheadAncillas } from "./getCheckQubits.js";
import { line } from "./couplingMaps.js";

describe("getCheckQubits", () => {
  it("pairs interior payload qubits with free neighbors on a line", () => {
    // Line 0-1-2-3-4; payload occupies {1, 2, 3}; ancillas available at 0 and 4.
    const { targetQubits, ancillaQubits } = getCheckQubits(line(5), [1, 2, 3]);
    // 0 borders 1; 4 borders 3. Qubit 2 has no free neighbor.
    expect(targetQubits).toEqual([1, 3]);
    expect(ancillaQubits).toEqual([0, 4]);
  });

  it("maps ancillas to all bordered layout qubits", () => {
    const anc = getLowOverheadAncillas(line(5), [1, 2, 3]);
    expect(anc.get(0)).toEqual([1]);
    expect(anc.get(4)).toEqual([3]);
  });

  it("uses each ancilla at most once", () => {
    // Star: center 0 connected to 1,2,3. Payload {1}; ancilla 0 borders it.
    const star: [number, number][] = [
      [0, 1],
      [0, 2],
      [0, 3],
    ];
    const { targetQubits, ancillaQubits } = getCheckQubits(star, [1, 2]);
    // Ancilla 0 borders both 1 and 2 but can only serve one (the smallest).
    expect(targetQubits).toEqual([1]);
    expect(ancillaQubits).toEqual([0]);
  });
});

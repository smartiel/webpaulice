import { describe, it, expect } from "vitest";
import { brickworkQasm } from "./generate.js";
import { parseQasm } from "./parse.js";

describe("brickworkQasm", () => {
  it("produces a parseable brickwork circuit", () => {
    const c = parseQasm(brickworkQasm(6, 8, 1));
    expect(c.nqubits).toBe(6);
    // Starts with an H on every qubit.
    expect(c.gates.slice(0, 6).map((g) => g.name)).toEqual(Array(6).fill("h"));
    // Has entangling CZ gates and terminal measurements.
    expect(c.gates.some((g) => g.name === "cz")).toBe(true);
    expect(c.measures.length).toBe(6);
    // Only Clifford gates from the generator's basis appear.
    const names = new Set(c.gates.map((g) => g.name));
    expect([...names].every((n) => ["h", "cz", "s", "sx"].includes(n))).toBe(true);
  });

  it("alternates CZ parity between layers", () => {
    // depth 2, 4 qubits: layer 0 -> (0,1),(2,3); layer 1 -> (1,2).
    const c = parseQasm(brickworkQasm(4, 2, 0));
    const czs = c.gates.filter((g) => g.name === "cz").map((g) => g.qubits.join(","));
    expect(czs).toContain("0,1");
    expect(czs).toContain("2,3");
    expect(czs).toContain("1,2");
  });

  it("is deterministic for a fixed seed", () => {
    expect(brickworkQasm(5, 6, 42)).toBe(brickworkQasm(5, 6, 42));
  });

  it("rejects degenerate parameters", () => {
    expect(() => brickworkQasm(1, 4)).toThrow(/2 qubits/);
    expect(() => brickworkQasm(4, 0)).toThrow(/depth/);
  });
});

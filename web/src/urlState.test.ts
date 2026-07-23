import { describe, it, expect } from "vitest";
import { encodeState, decodeState, type AppSnapshot } from "./urlState.js";

const snap: AppSnapshot = {
  qasm: 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\nh q[0];\ncx q[0],q[1];\n',
  layout: "line",
  lineN: 8,
  gridRows: 4,
  gridCols: 4,
  custom: "0 1\n1 2\n",
  targets: [1, 2, 3],
  depol: 0.001,
  readout: 0,
  seed: "42",
  ntries: 30,
  useStabilizers: true,
};

describe("urlState", () => {
  it("round-trips a snapshot through the URL fragment", () => {
    const s = encodeState(snap);
    // base64url alphabet only (safe in a hash).
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeState("#s=" + s)).toEqual(snap);
    expect(decodeState("#qasm=x&s=" + s)).toEqual(snap);
  });

  it("returns null when no state param is present or it is malformed", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("#qasm=abc")).toBeNull();
    expect(decodeState("#s=%%%not-base64%%%")).toBeNull();
  });

  it("preserves unicode and newlines in the QASM", () => {
    const u = { ...snap, qasm: "// π/2 rz\nrz(pi/2) q[0];\n" };
    expect(decodeState("#s=" + encodeState(u))!.qasm).toBe(u.qasm);
  });
});

// Device connectivity: IBM heavy-hex presets (with fixed coordinates),
// generators, and custom parsing.
//
// The heavy-hex presets use qiskit's canonical `qubit_coordinates` (row, col)
// for the 7-, 27-, and 127-qubit devices. Coupling edges are derived from grid
// adjacency (Manhattan distance 1), which reproduces the real device coupling
// maps exactly. The coordinates are also used to render the connectivity graph
// with a faithful fixed layout (no force-directed folding).

import type { CouplingMap } from "../types.js";

/** A fixed 2D coordinate per qubit: `[row, col]`. */
export type Coords = [number, number][];

/** Linear chain: 0-1-2-...-(n-1). */
export function line(n: number): CouplingMap {
  const edges: CouplingMap = [];
  for (let i = 0; i < n - 1; i++) edges.push([i, i + 1]);
  return edges;
}

/** Rectangular grid with nearest-neighbor coupling. */
export function grid(rows: number, cols: number): CouplingMap {
  const edges: CouplingMap = [];
  const idx = (r: number, c: number) => r * cols + c;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) edges.push([idx(r, c), idx(r, c + 1)]);
      if (r + 1 < rows) edges.push([idx(r, c), idx(r + 1, c)]);
    }
  }
  return edges;
}

/** Derive an undirected coupling map from qubit coordinates (grid neighbors). */
export function edgesFromCoords(coords: Coords): CouplingMap {
  const edges: CouplingMap = [];
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      const d = Math.abs(coords[i][0] - coords[j][0]) +
        Math.abs(coords[i][1] - coords[j][1]);
      if (d === 1) edges.push([i, j]);
    }
  }
  return edges;
}

/** Coordinates for a `rows × cols` grid (row-major, `[row, col]`). */
export function gridCoords(rows: number, cols: number): Coords {
  const coords: Coords = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) coords.push([r, c]);
  return coords;
}

/** A `rows × cols` grid layout (coordinates + coupling map). */
export function gridLayout(rows: number, cols: number): { coords: Coords; map: CouplingMap } {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new Error("Grid dimensions must be positive integers.");
  }
  return { coords: gridCoords(rows, cols), map: grid(rows, cols) };
}

/**
 * A "caterpillar" layout: a line of `n` data qubits (the spine), each with one
 * extra ancilla attached (a leg). Device qubits are ordered spine-first
 * (indices `0..n-1`) then legs (`n..2n-1`), so leg `n+i` is the dedicated
 * ancilla of data qubit `i`. Edges are the spine line plus each data↔ancilla
 * rung; legs are NOT connected to each other (so this is built explicitly
 * rather than via grid adjacency).
 */
export function caterpillar(n: number): { coords: Coords; map: CouplingMap } {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("Caterpillar needs at least 1 data qubit.");
  }
  const coords: Coords = [];
  for (let i = 0; i < n; i++) coords.push([1, i]); // spine (data) 0..n-1
  for (let i = 0; i < n; i++) coords.push([0, i]); // legs (ancilla) n..2n-1
  const map: CouplingMap = [];
  for (let i = 0; i < n - 1; i++) map.push([i, i + 1]); // spine line
  for (let i = 0; i < n; i++) map.push([i, n + i]); // data ↔ ancilla rung
  return { coords, map };
}

// qiskit canonical qubit_coordinates (row, col), verbatim.
const IBM_7_COORDS: Coords = [
  [0, 0], [0, 1], [0, 2], [1, 1], [2, 0], [2, 1], [2, 2],
];

const IBM_27_COORDS: Coords = [
  [1, 0], [1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [0, 3],
  [1, 3], [3, 3], [4, 3], [1, 4], [3, 4], [1, 5], [2, 5],
  [3, 5], [1, 6], [3, 6], [0, 7], [1, 7], [3, 7], [4, 7],
  [1, 8], [3, 8], [1, 9], [2, 9], [3, 9], [3, 10],
];

const IBM_127_COORDS: Coords = [
  [0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7],
  [0, 8], [0, 9], [0, 10], [0, 11], [0, 12], [0, 13],
  [1, 0], [1, 4], [1, 8], [1, 12],
  [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7],
  [2, 8], [2, 9], [2, 10], [2, 11], [2, 12], [2, 13], [2, 14],
  [3, 2], [3, 6], [3, 10], [3, 14],
  [4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7],
  [4, 8], [4, 9], [4, 10], [4, 11], [4, 12], [4, 13], [4, 14],
  [5, 0], [5, 4], [5, 8], [5, 12],
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6], [6, 7],
  [6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 2], [7, 6], [7, 10], [7, 14],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 6], [8, 7],
  [8, 8], [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [9, 0], [9, 4], [9, 8], [9, 12],
  [10, 0], [10, 1], [10, 2], [10, 3], [10, 4], [10, 5], [10, 6], [10, 7],
  [10, 8], [10, 9], [10, 10], [10, 11], [10, 12], [10, 13], [10, 14],
  [11, 2], [11, 6], [11, 10], [11, 14],
  [12, 1], [12, 2], [12, 3], [12, 4], [12, 5], [12, 6], [12, 7],
  [12, 8], [12, 9], [12, 10], [12, 11], [12, 12], [12, 13], [12, 14],
];

export interface Preset {
  id: string;
  label: string;
  description: string;
  coords: Coords;
  map: CouplingMap;
}

function preset(
  id: string,
  label: string,
  description: string,
  coords: Coords,
): Preset {
  return { id, label, description, coords, map: edgesFromCoords(coords) };
}

/** Number of qubits implied by a coupling map (max index + 1). */
export function numQubits(map: CouplingMap): number {
  let max = -1;
  for (const [a, b] of map) max = Math.max(max, a, b);
  return max + 1;
}

/** Built-in layout presets offered in the UI. */
export const PRESETS: Preset[] = [
  preset(
    "ibm_falcon_7",
    "IBM heavy-hex (7 qubits)",
    "Falcon H topology (ibm_nairobi / perth / lagos).",
    IBM_7_COORDS,
  ),
  preset(
    "ibm_falcon_27",
    "IBM heavy-hex (27 qubits)",
    "Falcon heavy-hex (ibmq_montreal / mumbai).",
    IBM_27_COORDS,
  ),
  preset(
    "ibm_eagle_127",
    "IBM heavy-hex (127 qubits)",
    "Eagle heavy-hex (ibm_washington / sherbrooke / brisbane).",
    IBM_127_COORDS,
  ),
];

/**
 * Parse a custom coupling map from text. Accepts one edge per line as
 * `a b` or `a,b`, ignoring blank lines and `#`/`//` comments. Undirected.
 */
export function parseCoupling(text: string): CouplingMap {
  const edges: CouplingMap = [];
  for (const raw of text.split("\n")) {
    const trimmed = raw.replace(/[#/].*$/, "").trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[\s,]+/).map(Number);
    if (parts.length !== 2 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
      throw new Error(`Invalid edge line: "${raw.trim()}" (expected "a b").`);
    }
    edges.push([parts[0], parts[1]]);
  }
  if (edges.length === 0) throw new Error("No edges parsed from custom coupling map.");
  return edges;
}

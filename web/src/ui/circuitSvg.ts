// Qiskit-style SVG circuit renderer (dark theme, matching the app palette).
//
// Gates are greedily left-packed into time columns. Two-qubit gates reserve
// their full vertical span so nothing overlaps their connecting line. Check
// ancilla qubits and their target qubits are highlighted.

import type { Circuit } from "../types.js";

const ROW_H = 46;
const COL_W = 46;
const PAD_X = 84; // label gutter
const PAD_Y = 26;
const GATE = 30;
const R_CTRL = 5;
const R_TARGET = 11;

// Palette (Catppuccin Mocha).
const C_BG = "#1e1e2e";
const C_WIRE = "#cdd6f4";
const C_MUTED = "#9399b2";
const C_TARGET = "#89b4fa"; // accent-2 (blue)
const C_CHECK = "#cba6f7"; // mauve
const C_GATE_TEXT = "#1e1e2e";
const C_CX = "#89b4fa";
const C_CZ = "#cba6f7";
const C_MEAS = "#585b70";

const LABELS: Record<string, string> = {
  h: "H",
  s: "S",
  sdg: "S†",
  sx: "√X",
  sxdg: "√X†",
  x: "X",
  z: "Z",
  t: "T",
  tdg: "T†",
};

/** Per-gate fill color for single-qubit boxes. */
function gateFill(name: string): string {
  switch (name) {
    case "s":
    case "sdg":
      return "#f9e2af"; // yellow
    case "sx":
    case "sxdg":
      return "#94e2d5"; // teal
    default:
      return "#fab387"; // orange
  }
}

export interface CircuitSvgOptions {
  checkQubits?: Iterable<number>;
  targetQubits?: Iterable<number>;
  nqubits?: number;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Render `circuit` to an SVG markup string. */
export function renderCircuitSvg(
  circuit: Circuit,
  options: CircuitSvgOptions = {},
): string {
  const n = options.nqubits ?? circuit.nqubits;
  const checks = new Set(options.checkQubits ?? []);
  const targets = new Set(options.targetQubits ?? []);

  const nextFree = new Array<number>(n).fill(0);
  interface Placed {
    col: number;
    kind: "gate" | "cx" | "cz" | "measure";
    qubits: number[];
    name?: string;
    label?: string;
    creg?: string;
  }
  const placed: Placed[] = [];

  // Reserve the full vertical span of an op so a two-qubit gate's column is
  // exclusive across every wire its connecting line crosses.
  const place = (qubits: number[]): number => {
    const lo = Math.min(...qubits);
    const hi = Math.max(...qubits);
    let col = 0;
    for (let q = lo; q <= hi; q++) col = Math.max(col, nextFree[q]);
    for (let q = lo; q <= hi; q++) nextFree[q] = col + 1;
    return col;
  };

  for (const g of circuit.gates) {
    if (g.name === "cx" || g.name === "cz") {
      placed.push({ col: place(g.qubits), kind: g.name, qubits: g.qubits });
    } else {
      const label = LABELS[g.name] ?? g.name.toUpperCase();
      placed.push({ col: place(g.qubits), kind: "gate", qubits: g.qubits, name: g.name, label });
    }
  }
  for (const m of circuit.measures) {
    placed.push({
      col: place([m.qubit]),
      kind: "measure",
      qubits: [m.qubit],
      creg: `${m.creg}[${m.bit}]`,
    });
  }

  const nCols = Math.max(1, ...nextFree);
  const width = PAD_X + nCols * COL_W + 20;
  const height = PAD_Y * 2 + n * ROW_H;
  const yOf = (q: number) => PAD_Y + q * ROW_H + ROW_H / 2;
  const xOf = (col: number) => PAD_X + col * COL_W + COL_W / 2;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" class="circuit-svg" font-family="ui-monospace,monospace">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${C_BG}"/>`,
  );

  for (let q = 0; q < n; q++) {
    const y = yOf(q);
    const isCheck = checks.has(q);
    const isTarget = targets.has(q);
    parts.push(
      `<line x1="${PAD_X - 10}" y1="${y}" x2="${width - 10}" y2="${y}" ` +
        `stroke="${isCheck ? C_CHECK : C_WIRE}" stroke-width="1.3"/>`,
    );
    const labelColor = isCheck ? C_CHECK : isTarget ? C_TARGET : C_MUTED;
    const name = isCheck ? `a${q}` : `q${q}`;
    parts.push(
      `<text x="${PAD_X - 18}" y="${y + 4}" text-anchor="end" font-size="13" ` +
        `fill="${labelColor}" font-weight="${isTarget || isCheck ? 700 : 400}">${name}</text>`,
    );
  }

  for (const op of placed) {
    const x = xOf(op.col);
    if (op.kind === "gate") {
      const y = yOf(op.qubits[0]);
      parts.push(
        `<rect x="${x - GATE / 2}" y="${y - GATE / 2}" width="${GATE}" height="${GATE}" ` +
          `rx="5" fill="${gateFill(op.name!)}"/>`,
        `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="${C_GATE_TEXT}">${esc(op.label!)}</text>`,
      );
    } else if (op.kind === "cx" || op.kind === "cz") {
      const [c, t] = op.qubits;
      const yc = yOf(c);
      const yt = yOf(t);
      const stroke = op.kind === "cz" ? C_CZ : C_CX;
      parts.push(
        `<line x1="${x}" y1="${Math.min(yc, yt)}" x2="${x}" y2="${Math.max(yc, yt)}" stroke="${stroke}" stroke-width="1.6"/>`,
        `<circle cx="${x}" cy="${yc}" r="${R_CTRL}" fill="${stroke}"/>`,
      );
      if (op.kind === "cz") {
        parts.push(`<circle cx="${x}" cy="${yt}" r="${R_CTRL}" fill="${stroke}"/>`);
      } else {
        parts.push(
          `<circle cx="${x}" cy="${yt}" r="${R_TARGET}" fill="${C_BG}" stroke="${stroke}" stroke-width="1.6"/>`,
          `<line x1="${x - R_TARGET}" y1="${yt}" x2="${x + R_TARGET}" y2="${yt}" stroke="${stroke}" stroke-width="1.6"/>`,
          `<line x1="${x}" y1="${yt - R_TARGET}" x2="${x}" y2="${yt + R_TARGET}" stroke="${stroke}" stroke-width="1.6"/>`,
        );
      }
    } else if (op.kind === "measure") {
      const y = yOf(op.qubits[0]);
      const isCheck = checks.has(op.qubits[0]);
      const stroke = isCheck ? C_CHECK : C_MUTED;
      parts.push(
        `<rect x="${x - GATE / 2}" y="${y - GATE / 2}" width="${GATE}" height="${GATE}" ` +
          `rx="5" fill="${C_MEAS}" stroke="${stroke}" stroke-width="1.4"/>`,
        `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" fill="${C_WIRE}">M</text>`,
        `<text x="${x}" y="${y + GATE / 2 + 12}" text-anchor="middle" font-size="9" fill="${C_MUTED}">${esc(op.creg!)}</text>`,
      );
    }
  }

  parts.push("</svg>");
  return parts.join("");
}

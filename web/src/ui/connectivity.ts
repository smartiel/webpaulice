// SVG renderer for a device coupling map.
//
// When fixed coordinates are supplied (the IBM presets and the line/grid
// generators), qubits are drawn at those grid positions with the aspect ratio
// preserved — a faithful device layout. For custom coupling maps with no
// coordinates, a small deterministic force-directed relaxation is used instead.

import type { CouplingMap } from "../types.js";
import type { Coords } from "../layout/couplingMaps.js";
import { numQubits } from "../layout/couplingMaps.js";

const FR_SIZE = 460;
const MARGIN = 30;
const CELL = 44; // px per grid unit for fixed-coordinate layouts
const NODE_R = 13;

/** Deterministic force-directed positions in [0,1]² (fallback for custom maps). */
export function computePositions(map: CouplingMap, nq: number): [number, number][] {
  const pos: [number, number][] = Array.from({ length: nq }, (_, i) => {
    const a = (2 * Math.PI * i) / Math.max(1, nq);
    return [0.5 + 0.4 * Math.cos(a), 0.5 + 0.4 * Math.sin(a)];
  });
  if (nq <= 1) return pos;

  const edges = map.filter(([a, b]) => a < nq && b < nq);
  const k = 1 / Math.sqrt(nq);
  let temp = 0.1;

  for (let it = 0; it < 250; it++) {
    const disp: [number, number][] = Array.from({ length: nq }, () => [0, 0]);
    for (let i = 0; i < nq; i++) {
      for (let j = i + 1; j < nq; j++) {
        let dx = pos[i][0] - pos[j][0];
        let dy = pos[i][1] - pos[j][1];
        const dist = Math.hypot(dx, dy) || 1e-4;
        const force = (k * k) / dist;
        dx /= dist; dy /= dist;
        disp[i][0] += dx * force; disp[i][1] += dy * force;
        disp[j][0] -= dx * force; disp[j][1] -= dy * force;
      }
    }
    for (const [a, b] of edges) {
      let dx = pos[a][0] - pos[b][0];
      let dy = pos[a][1] - pos[b][1];
      const dist = Math.hypot(dx, dy) || 1e-4;
      const force = (dist * dist) / k;
      dx /= dist; dy /= dist;
      disp[a][0] -= dx * force; disp[a][1] -= dy * force;
      disp[b][0] += dx * force; disp[b][1] += dy * force;
    }
    for (let i = 0; i < nq; i++) {
      const d = Math.hypot(disp[i][0], disp[i][1]) || 1e-4;
      pos[i][0] += (disp[i][0] / d) * Math.min(d, temp);
      pos[i][1] += (disp[i][1] / d) * Math.min(d, temp);
      pos[i][0] = Math.min(1, Math.max(0, pos[i][0]));
      pos[i][1] = Math.min(1, Math.max(0, pos[i][1]));
    }
    temp *= 0.99;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pos) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const sx = maxX - minX || 1;
  const sy = maxY - minY || 1;
  return pos.map(([x, y]) => [
    MARGIN + ((x - minX) / sx) * (FR_SIZE - 2 * MARGIN),
    MARGIN + ((y - minY) / sy) * (FR_SIZE - 2 * MARGIN),
  ]);
}

export interface ConnectivityOptions {
  payloadQubits?: Iterable<number>;
  targetQubits?: Iterable<number>;
  ancillaQubits?: Iterable<number>;
  /** Fixed per-qubit `[row, col]` coordinates; enables the faithful layout. */
  coords?: Coords;
}

/** Compute pixel node positions and the SVG canvas size. */
function layout(
  map: CouplingMap,
  coords: Coords | undefined,
): { positions: [number, number][]; width: number; height: number } {
  if (coords && coords.length > 0) {
    const cols = coords.map((c) => c[1]);
    const rows = coords.map((c) => c[0]);
    const minX = Math.min(...cols), maxX = Math.max(...cols);
    const minY = Math.min(...rows), maxY = Math.max(...rows);
    const positions = coords.map(
      ([r, c]) =>
        [MARGIN + (c - minX) * CELL, MARGIN + (r - minY) * CELL] as [number, number],
    );
    return {
      positions,
      width: 2 * MARGIN + (maxX - minX) * CELL,
      height: 2 * MARGIN + (maxY - minY) * CELL,
    };
  }
  return { positions: computePositions(map, numQubits(map)), width: FR_SIZE, height: FR_SIZE };
}

/** Render the coupling map as clickable SVG (nodes carry `data-qubit`). */
export function renderConnectivity(
  map: CouplingMap,
  options: ConnectivityOptions = {},
): string {
  const { positions, width, height } = layout(map, options.coords);
  const nq = positions.length;
  const payload = new Set(options.payloadQubits ?? []);
  const targets = new Set(options.targetQubits ?? []);
  const ancillas = new Set(options.ancillaQubits ?? []);
  const px = (i: number) => positions[i][0];
  const py = (i: number) => positions[i][1];

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" class="conn-svg" font-family="ui-monospace,monospace">`,
  ];

  for (const [a, b] of map) {
    if (a >= nq || b >= nq) continue;
    parts.push(
      `<line x1="${px(a)}" y1="${py(a)}" x2="${px(b)}" y2="${py(b)}" stroke="#45475a" stroke-width="2"/>`,
    );
  }

  for (let i = 0; i < nq; i++) {
    // Dark palette: default surface, payload outlined blue, target filled blue,
    // suggested ancilla outlined mauve.
    let fill = "#2a2a3c", stroke = "#585b70", textFill = "#9399b2";
    if (targets.has(i)) {
      fill = "#89b4fa"; stroke = "#b4befe"; textFill = "#1e1e2e";
    } else if (ancillas.has(i)) {
      fill = "rgba(203,166,247,0.12)"; stroke = "#cba6f7"; textFill = "#cba6f7";
    } else if (payload.has(i)) {
      fill = "#313244"; stroke = "#89b4fa"; textFill = "#cdd6f4";
    }
    const clickable = payload.has(i);
    parts.push(
      `<g data-qubit="${i}" style="cursor:${clickable ? "pointer" : "default"}">` +
        `<circle cx="${px(i)}" cy="${py(i)}" r="${NODE_R}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
        `<text x="${px(i)}" y="${py(i) + 4}" text-anchor="middle" font-size="11" fill="${textFill}">${i}</text>` +
        `</g>`,
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

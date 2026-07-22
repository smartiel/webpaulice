// SVG line chart of the gamma cost (Γ) as a function of the number of committed
// checks. Γ is the sampling overhead of the uncovered inverse noise channel
// (lower is better); this recaps how it improves as checks are added.

const PAD_L = 66;
const PAD_R = 18;
const PAD_T = 30;
const PAD_B = 38;
const H = 220;

// Palette (Catppuccin Mocha), matching the rest of the UI.
const C_AXIS = "#45475a";
const C_MUTED = "#9399b2";
const C_LINE = "#fab387"; // accent (peach)
const C_POINT = "#fab387";
const C_SELECT = "#89b4fa"; // accent-2 (blue)
const C_TEXT = "#cdd6f4";

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e4)) return v.toExponential(3);
  return v.toPrecision(4);
}

export interface CostChartOptions {
  /** Index of the currently-selected variant to highlight. */
  selected?: number;
}

/**
 * Render Γ vs. number of checks. `costs[k]` is the gamma value after committing
 * the first `k` checks (so `costs[0]` is the bare circuit).
 */
export function renderCostChart(costs: number[], options: CostChartOptions = {}): string {
  const n = costs.length;
  const selected = options.selected ?? -1;
  const W = Math.max(340, PAD_L + PAD_R + Math.max(1, n - 1) * 72);

  let min = Math.min(...costs);
  let max = Math.max(...costs);
  if (!(max > min)) {
    // Flat series: pad so the line is visible and centered.
    const c = Number.isFinite(max) ? max : 0;
    min = c - Math.max(1e-6, Math.abs(c) * 0.05);
    max = c + Math.max(1e-6, Math.abs(c) * 0.05);
  }

  const xOf = (i: number) => (n === 1 ? PAD_L : PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R));
  const yOf = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
      `viewBox="0 0 ${W} ${H}" class="cost-chart" font-family="ui-monospace,monospace">`,
  ];

  // Axes.
  parts.push(
    `<line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${H - PAD_B}" stroke="${C_AXIS}" stroke-width="1"/>`,
    `<line x1="${PAD_L}" y1="${H - PAD_B}" x2="${W - PAD_R}" y2="${H - PAD_B}" stroke="${C_AXIS}" stroke-width="1"/>`,
  );

  // Y-axis min/max labels.
  parts.push(
    `<text x="${PAD_L - 8}" y="${yOf(max) + 4}" text-anchor="end" font-size="10" fill="${C_MUTED}">${fmt(max)}</text>`,
    `<text x="${PAD_L - 8}" y="${yOf(min) + 4}" text-anchor="end" font-size="10" fill="${C_MUTED}">${fmt(min)}</text>`,
    `<text x="14" y="${PAD_T - 12}" font-size="11" fill="${C_TEXT}">Γ</text>`,
  );

  // Line.
  const pathD = costs.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(v)}`).join(" ");
  parts.push(`<path d="${pathD}" fill="none" stroke="${C_LINE}" stroke-width="2"/>`);

  // Points + x labels.
  for (let i = 0; i < n; i++) {
    const x = xOf(i);
    const y = yOf(costs[i]);
    const isSel = i === selected;
    parts.push(
      `<circle cx="${x}" cy="${y}" r="${isSel ? 5.5 : 3.5}" fill="${isSel ? C_SELECT : C_POINT}" ` +
        `stroke="${isSel ? C_SELECT : "none"}" stroke-width="2" fill-opacity="${isSel ? 1 : 0.9}"/>`,
      `<text x="${x}" y="${H - PAD_B + 16}" text-anchor="middle" font-size="10" ` +
        `fill="${isSel ? C_SELECT : C_MUTED}">${i}</text>`,
    );
  }
  parts.push(
    `<text x="${(PAD_L + W - PAD_R) / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="${C_MUTED}">number of checks</text>`,
  );

  parts.push("</svg>");
  return parts.join("");
}

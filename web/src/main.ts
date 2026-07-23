import "./style.css";

import type {
  CheckedVariant,
  Circuit,
  CouplingMap,
  NoiseParam,
  PickResult,
} from "./types.js";
import { parseQasm } from "./qasm/parse.js";
import { toQasm } from "./qasm/export.js";
import { brickworkQasm } from "./qasm/generate.js";
import { renderCircuitSvg } from "./ui/circuitSvg.js";
import { renderConnectivity } from "./ui/connectivity.js";
import { renderCostChart } from "./ui/costChart.js";
import {
  PRESETS,
  numQubits,
  parseCoupling,
  caterpillar,
  gridLayout,
  type Coords,
} from "./layout/couplingMaps.js";
import { getCheckQubits } from "./layout/getCheckQubits.js";
import { buildViewerLayout } from "./layout/viewerLayout.js";
import type { RunRequest, WorkerResponse } from "./workerApi.js";
import { encodeState, decodeState, type AppSnapshot } from "./urlState.js";
import { toQiskitCode } from "./qiskitExport.js";

const EXAMPLE_QASM = `OPENQASM 2.0;
include "qelib1.inc";
qreg q[5];
creg c[5];
h q[0];
h q[1];
h q[2];
h q[3];
h q[4];
cx q[0],q[1];
cx q[2],q[3];
cx q[1],q[2];
cx q[3],q[4];
s q[0];
s q[2];
cx q[0],q[1];
cx q[2],q[3];
cx q[1],q[2];
cx q[3],q[4];
measure q[0] -> c[0];
measure q[1] -> c[1];
measure q[2] -> c[2];
measure q[3] -> c[3];
measure q[4] -> c[4];
`;

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

/** A stat box (`.stat`) for the `.stats` rows. */
function stat(label: string, value: string | number): string {
  return `<div class="stat"><span class="label">${label}</span><span class="value">${value}</span></div>`;
}

/** Show `msg` in the element as an error panel, or clear/hide it. */
function setError(id: string, msg: string): void {
  const el = $(id);
  if (msg) {
    el.textContent = msg;
    el.className = "error-panel";
  } else {
    el.textContent = "";
    el.className = "hidden";
  }
}

interface AppState {
  circuit: Circuit | null;
  couplingMap: CouplingMap;
  coords: Coords | null;
  selectedTargets: Set<number>;
  result: PickResult | null;
  selectedVariant: number;
}

const state: AppState = {
  circuit: null,
  couplingMap: PRESETS[0].map,
  coords: PRESETS[0].coords,
  selectedTargets: new Set(),
  result: null,
  selectedVariant: 0,
};

// ---- Layout / connectivity ------------------------------------------------

function deviceQubitCount(): number {
  return state.coords ? state.coords.length : numQubits(state.couplingMap);
}

function payloadQubits(): number[] {
  if (!state.circuit) return [];
  const n = Math.min(state.circuit.nqubits, deviceQubitCount());
  return Array.from({ length: n }, (_, i) => i);
}

function suggestedAncillas(): Map<number, number> {
  const map = new Map<number, number>();
  if (!state.circuit) return map;
  const { targetQubits, ancillaQubits } = getCheckQubits(
    state.couplingMap,
    payloadQubits(),
  );
  targetQubits.forEach((t, i) => map.set(t, ancillaQubits[i]));
  return map;
}

function renderConnectivityGraph(): void {
  const anc = suggestedAncillas();
  const ancForSelected = [...state.selectedTargets]
    .map((t) => anc.get(t))
    .filter((a): a is number => a !== undefined);
  $("connectivity").innerHTML = renderConnectivity(state.couplingMap, {
    payloadQubits: payloadQubits(),
    targetQubits: state.selectedTargets,
    ancillaQubits: ancForSelected,
    coords: state.coords ?? undefined,
  });
}

function renderAncillaInfo(): void {
  const info = $("ancilla-info");
  if (state.selectedTargets.size === 0) {
    info.innerHTML = "No data qubits selected yet.";
    return;
  }
  const anc = suggestedAncillas();
  const rows = [...state.selectedTargets].sort((a, b) => a - b).map((t) => {
    const a = anc.get(t);
    return a === undefined
      ? `q${t} → <em>no free neighbor on this device</em>`
      : `q${t} → ancilla ${a}`;
  });
  info.innerHTML =
    `<strong>${state.selectedTargets.size}</strong> target(s). Suggested hardware ` +
    `ancillas (informational):<br>${rows.join("<br>")}`;
}

// ---- Qubit selection ------------------------------------------------------

function renderCheckboxes(): void {
  const box = $("qubit-checkboxes");
  box.innerHTML = "";
  if (!state.circuit) return;
  for (let q = 0; q < state.circuit.nqubits; q++) {
    const span = document.createElement("span");
    span.className = "qcb" + (state.selectedTargets.has(q) ? " checked" : "");
    span.textContent = `q${q}`;
    span.dataset.qubit = String(q);
    span.addEventListener("click", () => toggleTarget(q));
    box.appendChild(span);
  }
}

function toggleTarget(q: number): void {
  if (!state.circuit || q >= state.circuit.nqubits) return;
  if (state.selectedTargets.has(q)) state.selectedTargets.delete(q);
  else state.selectedTargets.add(q);
  renderCheckboxes();
  renderConnectivityGraph();
  renderAncillaInfo();
  updateRunEnabled();
}

function updateRunEnabled(): void {
  const canRun = !!state.circuit && state.selectedTargets.size > 0;
  $("step-run").classList.toggle("disabled", !canRun);
}

// ---- Circuit parsing ------------------------------------------------------

function parseCircuit(): void {
  setError("circuit-error", "");
  try {
    const circuit = parseQasm(($("qasm-input") as HTMLTextAreaElement).value);
    state.circuit = circuit;
    state.selectedTargets = new Set();
    state.result = null;
    $("results").classList.add("hidden");

    const g2 = circuit.gates.filter((g) => g.qubits.length >= 2).length;
    $("circuit-summary").innerHTML =
      `<div class="stats">` +
      stat("Qubits", circuit.nqubits) +
      stat("Gates", circuit.gates.length) +
      stat("Entangling", g2) +
      stat("Measurements", circuit.measures.length) +
      `</div>`;
    $("circuit-diagram").innerHTML = renderCircuitSvg(circuit);

    renderCheckboxes();
    renderConnectivityGraph();
    renderAncillaInfo();
    $("step-config").classList.remove("disabled");
    updateRunEnabled();
  } catch (e) {
    state.circuit = null;
    $("circuit-summary").innerHTML = "";
    $("circuit-diagram").innerHTML = "";
    $("step-config").classList.add("disabled");
    $("step-run").classList.add("disabled");
    setError("circuit-error", e instanceof Error ? e.message : String(e));
  }
}

// ---- Run ------------------------------------------------------------------

function runInWorker(
  req: RunRequest,
  onProgress: (p: { index: number; total: number; target: number }) => void,
  onCommit: (c: { k: number; target: number | null; cost: number }) => void,
): Promise<PickResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const m = e.data;
      if (m.type === "progress") onProgress(m);
      else if (m.type === "commit") onCommit(m);
      else if (m.type === "result") {
        resolve(m.result);
        worker.terminate();
      } else if (m.type === "error") {
        reject(new Error(m.message));
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(e.message || "Worker error"));
      worker.terminate();
    };
    worker.postMessage(req);
  });
}

async function run(): Promise<void> {
  if (!state.circuit) return;
  setError("run-error", "");
  const status = $("run-status");
  const btn = $<HTMLButtonElement>("btn-run");

  const noise: NoiseParam[] = [];
  const depol = Number(($("depol-rate") as HTMLInputElement).value);
  if (depol > 0) noise.push({ kind: "uniform_depolarizing", rate: depol });
  const readout = Number(($("readout-rate") as HTMLInputElement).value);
  if (readout > 0) noise.push({ kind: "readout", rate: readout });
  if (noise.length === 0) {
    setError("run-error", "Set a positive depolarizing or readout rate.");
    return;
  }

  const seedStr = ($("seed") as HTMLInputElement).value.trim();
  const seed = seedStr === "" ? null : Number(seedStr);
  const ntries = Number(($("ntries") as HTMLInputElement).value) || 30;
  const useStabilizers = ($("use-stabilizers") as HTMLInputElement).checked;

  const targets = [...state.selectedTargets].sort((a, b) => a - b);

  const req: RunRequest = {
    type: "run",
    circuit: state.circuit,
    targets,
    noise,
    options: { seed, ntries, useStabilizers },
  };

  // Reveal the results panel and reset it for the live view.
  state.result = null;
  $("results").classList.remove("hidden");
  for (const id of ["variant-tabs", "variant-stats", "variant-info", "output-diagram", "cost-chart"]) {
    $(id).innerHTML = "";
  }
  $("output-qasm").classList.add("hidden");
  const liveCosts: number[] = [];

  btn.disabled = true;
  status.textContent = "Initializing…";
  try {
    const result = await runInWorker(
      req,
      (p) => {
        status.textContent = `Optimizing check ${p.index + 1}/${p.total} (qubit ${p.target})…`;
      },
      (c) => {
        // Grow the Γ chart live as each check commits.
        liveCosts.push(c.cost);
        $("cost-chart").innerHTML = renderCostChart(liveCosts, {
          selected: liveCosts.length - 1,
        });
        $("cost-recap").innerHTML =
          c.k === 0
            ? "Baseline Γ measured — searching for checks…"
            : `Committed <strong>${c.k}</strong> check(s), Γ = <strong>${c.cost.toPrecision(4)}</strong>…`;
      },
    );
    state.result = result;
    state.selectedVariant = result.variants.length - 1;
    status.textContent = `Done — committed ${result.committedTargets.length} check(s).`;
    renderResults(true);
  } catch (e) {
    setError("run-error", e instanceof Error ? e.message : String(e));
    status.textContent = "";
  } finally {
    btn.disabled = false;
  }
}

// ---- Results --------------------------------------------------------------

function renderResults(animateChart = false): void {
  const result = state.result;
  if (!result) return;
  $("results").classList.remove("hidden");

  // Recap: Γ convergence across the whole run.
  const costs = result.variants.map((v) => v.cost);
  $("cost-chart").innerHTML = renderCostChart(costs, {
    selected: state.selectedVariant,
    animate: animateChart,
  });
  const c0 = costs[0];
  const best = Math.min(...costs);
  const bestK = costs.indexOf(best);
  if (costs.length > 1 && Number.isFinite(c0) && c0 > 0) {
    const factor = c0 / best;
    const pct = (1 - best / c0) * 100;
    $("cost-recap").innerHTML =
      `Γ went from <strong>${c0.toPrecision(4)}</strong> (0 checks) to ` +
      `<strong>${best.toPrecision(4)}</strong> (${bestK} check${bestK === 1 ? "" : "s"}) — ` +
      `a <strong>${factor.toFixed(2)}×</strong> reduction (${pct.toFixed(1)}% lower). ` +
      `Lower Γ means less post-selection sampling overhead.`;
  } else {
    $("cost-recap").innerHTML =
      "No checks were committed, so Γ is unchanged. Try more targets, a higher " +
      "noise rate, or more tries per target.";
  }

  const tabs = $("variant-tabs");
  tabs.innerHTML = "";
  result.variants.forEach((v, k) => {
    const tab = document.createElement("button");
    tab.className = "tab" + (k === state.selectedVariant ? " active" : "");
    tab.textContent = k === 0 ? "0 checks" : `${k} check${k > 1 ? "s" : ""}`;
    tab.title = `cost = ${v.cost.toExponential(4)}`;
    tab.addEventListener("click", () => {
      state.selectedVariant = k;
      renderResults();
    });
    tabs.appendChild(tab);
  });

  const v = result.variants[state.selectedVariant];
  $("variant-stats").innerHTML =
    stat("Checks", state.selectedVariant) + stat("Cost (γ)", v.cost.toExponential(3));
  $("variant-info").innerHTML = v.checkQubits.length
    ? `Ancillas: <strong>${v.checkQubits.join(", ")}</strong>; targets: <strong>${v.targetQubits.join(", ")}</strong>.`
    : "Bare circuit (no checks).";

  renderOutputDiagram(v);

  const qasm = toQasm(v.circuit);
  const block = $("output-qasm");
  block.textContent = qasm;
  block.classList.remove("hidden");
  $("copy-ok").textContent = "";
}

/** Render the output circuit diagram for a variant. */
function renderOutputDiagram(v: CheckedVariant): void {
  $("output-diagram").innerHTML = renderCircuitSvg(v.circuit, {
    checkQubits: v.checkQubits,
    targetQubits: v.targetQubits,
  });
}

async function copyQasm(): Promise<void> {
  if (!state.result) return;
  const v = state.result.variants[state.selectedVariant];
  const ok = $("copy-ok");
  try {
    await navigator.clipboard.writeText(toQasm(v.circuit));
    ok.textContent = "✓ Copied to clipboard";
  } catch (e) {
    ok.textContent = e instanceof Error ? e.message : "Clipboard write failed";
  }
  setTimeout(() => (ok.textContent = ""), 2500);
}

/** Open the current variant in the 3D circuit viewer, passing circuit + layout
 *  via the URL fragment. */
function openIn3D(): void {
  if (!state.result) return;
  const v = state.result.variants[state.selectedVariant];
  const qasm = toQasm(v.circuit);
  const layout = buildViewerLayout(v, state.coords, suggestedAncillas());
  // Tell the viewer which qubits host checks so it can color check gates purple
  // and original gates dark green.
  const checks = v.checkQubits.join(",");
  const url =
    "https://smartiel.github.io/3dcircuit/#qasm=" +
    encodeURIComponent(qasm) +
    "&layout=" +
    encodeURIComponent(layout) +
    "&checks=" +
    encodeURIComponent(checks);
  const win = window.open(url, "_blank", "noopener");
  if (!win) {
    setError("run-error", "Could not open the 3D viewer (popup blocked?).");
  }
}

function downloadQasm(): void {
  if (!state.result) return;
  const v = state.result.variants[state.selectedVariant];
  const blob = new Blob([toQasm(v.circuit)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `checked_${state.selectedVariant}_checks.qasm`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Layout selection wiring ---------------------------------------------

/** Show only the parameter block relevant to the selected layout kind. */
function showLayoutParams(kind: "line" | "grid" | "custom" | "none"): void {
  $("lp-line").classList.toggle("hidden", kind !== "line");
  $("lp-grid").classList.toggle("hidden", kind !== "grid");
  $("custom-coupling").classList.toggle("hidden", kind !== "custom");
}

function onLayoutChange(): void {
  const sel = $("layout-select") as HTMLSelectElement;
  const desc = $("layout-desc");
  const v = sel.value;
  try {
    if (v === "line") {
      showLayoutParams("line");
      const n = Number(($("lp-line-n") as HTMLInputElement).value);
      const cat = caterpillar(n);
      state.coords = cat.coords;
      state.couplingMap = cat.map;
      desc.textContent =
        `Caterpillar: a line of ${n} data qubit(s), each with one attached ` +
        `ancilla (${2 * n} qubits total).`;
    } else if (v === "grid") {
      showLayoutParams("grid");
      const rows = Number(($("lp-grid-rows") as HTMLInputElement).value);
      const cols = Number(($("lp-grid-cols") as HTMLInputElement).value);
      const g = gridLayout(rows, cols);
      state.coords = g.coords;
      state.couplingMap = g.map;
      desc.textContent = `${rows}×${cols} square lattice (${rows * cols} qubits), nearest-neighbor.`;
    } else if (v === "custom") {
      showLayoutParams("custom");
      state.coords = null; // no fixed coordinates -> force-directed layout
      const custom = $("custom-coupling") as HTMLTextAreaElement;
      state.couplingMap = parseCoupling(custom.value || "0 1\n1 2\n2 3\n3 4");
      desc.textContent = "Enter one undirected edge per line (e.g. `0 1`).";
    } else {
      showLayoutParams("none");
      const preset = PRESETS.find((p) => p.id === v)!;
      state.couplingMap = preset.map;
      state.coords = preset.coords;
      desc.textContent = preset.description;
    }
  } catch (e) {
    // Invalid parameters (e.g. while typing); keep the previous map.
    desc.textContent = e instanceof Error ? e.message : String(e);
    return;
  }
  renderConnectivityGraph();
  renderAncillaInfo();
}

// ---- Shareable permalinks -------------------------------------------------

function captureState(): AppSnapshot {
  const val = (id: string) => ($(id) as HTMLInputElement).value;
  return {
    qasm: ($("qasm-input") as HTMLTextAreaElement).value,
    layout: ($("layout-select") as HTMLSelectElement).value,
    lineN: Number(val("lp-line-n")),
    gridRows: Number(val("lp-grid-rows")),
    gridCols: Number(val("lp-grid-cols")),
    custom: ($("custom-coupling") as HTMLTextAreaElement).value,
    targets: [...state.selectedTargets].sort((a, b) => a - b),
    depol: Number(val("depol-rate")),
    readout: Number(val("readout-rate")),
    seed: val("seed"),
    ntries: Number(val("ntries")),
    useStabilizers: ($("use-stabilizers") as HTMLInputElement).checked,
  };
}

function restoreState(s: AppSnapshot): void {
  const setVal = (id: string, v: string | number) => {
    ($(id) as HTMLInputElement).value = String(v);
  };
  ($("qasm-input") as HTMLTextAreaElement).value = s.qasm ?? "";
  ($("layout-select") as HTMLSelectElement).value = s.layout ?? PRESETS[0].id;
  if (s.lineN != null) setVal("lp-line-n", s.lineN);
  if (s.gridRows != null) setVal("lp-grid-rows", s.gridRows);
  if (s.gridCols != null) setVal("lp-grid-cols", s.gridCols);
  if (s.custom != null) ($("custom-coupling") as HTMLTextAreaElement).value = s.custom;
  setVal("depol-rate", s.depol ?? 0.001);
  setVal("readout-rate", s.readout ?? 0);
  ($("seed") as HTMLInputElement).value = s.seed ?? "";
  setVal("ntries", s.ntries ?? 30);
  ($("use-stabilizers") as HTMLInputElement).checked = !!s.useStabilizers;

  onLayoutChange();
  if (s.qasm && s.qasm.trim()) {
    parseCircuit();
    if (state.circuit) {
      const n = state.circuit.nqubits;
      state.selectedTargets = new Set((s.targets ?? []).filter((t) => t >= 0 && t < n));
      renderCheckboxes();
      renderConnectivityGraph();
      renderAncillaInfo();
      updateRunEnabled();
    }
  }
}

function copyQiskit(): void {
  const qasm = ($("qasm-input") as HTMLTextAreaElement).value.trim();
  if (!qasm) {
    setError("run-error", "Parse a circuit first to export Qiskit code.");
    return;
  }
  const num = (id: string) => Number(($(id) as HTMLInputElement).value);
  const seedStr = ($("seed") as HTMLInputElement).value.trim();
  const code = toQiskitCode({
    qasm,
    edges: state.couplingMap,
    targets: [...state.selectedTargets].sort((a, b) => a - b),
    depol: num("depol-rate"),
    readout: num("readout-rate"),
    seed: seedStr === "" ? null : Number(seedStr),
    ntries: num("ntries") || 30,
    useStabilizers: ($("use-stabilizers") as HTMLInputElement).checked,
  });
  const block = $("qiskit-code");
  block.textContent = code;
  block.classList.remove("hidden");
  const ok = $("link-ok");
  navigator.clipboard.writeText(code).then(
    () => {
      ok.textContent = "✓ Qiskit code copied";
      setTimeout(() => (ok.textContent = ""), 2500);
    },
    () => {
      ok.textContent = "Shown below (clipboard blocked)";
      setTimeout(() => (ok.textContent = ""), 2500);
    },
  );
}

async function copyLink(): Promise<void> {
  const url = location.origin + location.pathname + "#s=" + encodeState(captureState());
  const ok = $("link-ok");
  try {
    history.replaceState(null, "", url); // reflect in the address bar
    await navigator.clipboard.writeText(url);
    ok.textContent = "✓ Link copied";
  } catch {
    ok.textContent = "Copy failed — link is in the address bar";
  }
  setTimeout(() => (ok.textContent = ""), 2500);
}

// ---- Init -----------------------------------------------------------------

function init(): void {
  const sel = $("layout-select") as HTMLSelectElement;
  const addOption = (value: string, label: string) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  };
  for (const p of PRESETS) addOption(p.id, p.label);
  addOption("line", "Line + ancillas (caterpillar)");
  addOption("grid", "Grid");
  addOption("custom", "Custom coupling map…");
  $("layout-desc").textContent = PRESETS[0].description;

  sel.addEventListener("change", onLayoutChange);
  $("custom-coupling").addEventListener("input", onLayoutChange);
  for (const id of ["lp-line-n", "lp-grid-rows", "lp-grid-cols"]) {
    $(id).addEventListener("input", onLayoutChange);
  }

  $("btn-parse").addEventListener("click", parseCircuit);
  $("btn-example").addEventListener("click", () => {
    ($("qasm-input") as HTMLTextAreaElement).value = EXAMPLE_QASM;
    parseCircuit();
  });
  $("btn-brickwork").addEventListener("click", () => {
    setError("circuit-error", "");
    try {
      const nq = Number(($("bw-qubits") as HTMLInputElement).value);
      const depth = Number(($("bw-depth") as HTMLInputElement).value);
      const seedStr = ($("bw-seed") as HTMLInputElement).value.trim();
      const seed = seedStr === "" ? null : Number(seedStr);
      ($("qasm-input") as HTMLTextAreaElement).value = brickworkQasm(nq, depth, seed);
      parseCircuit();
    } catch (e) {
      setError("circuit-error", e instanceof Error ? e.message : String(e));
    }
  });
  $("qasm-file").addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    ($("qasm-input") as HTMLTextAreaElement).value = await file.text();
    parseCircuit();
  });

  // Select data qubits by clicking connectivity nodes (event delegation).
  $("connectivity").addEventListener("click", (e) => {
    const g = (e.target as Element).closest("[data-qubit]");
    if (!g) return;
    toggleTarget(Number((g as HTMLElement).dataset.qubit));
  });

  $("btn-run").addEventListener("click", run);
  $("btn-link").addEventListener("click", copyLink);
  $("btn-qiskit").addEventListener("click", copyQiskit);
  $("btn-copy").addEventListener("click", copyQasm);
  $("btn-download").addEventListener("click", downloadQasm);
  $("btn-3d").addEventListener("click", openIn3D);

  // Restore a shared configuration from the URL, if one is present.
  const snapshot = decodeState(location.hash);
  if (snapshot) restoreState(snapshot);
}

init();

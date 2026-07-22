// Top-level check-picking entry point.
//
// Mirrors qiskit_paulice.add_pauli_checks (non-ISA path) + pick_checks: build a
// station, run the windowed search, then rebuild each per-#checks variant with
// the original measurements restored and a dedicated check classical register
// added.

import type {
  CheckedVariant,
  Circuit,
  Creg,
  Measure,
  NoiseParam,
  PickOptions,
  PickResult,
} from "../types.js";
import { Station } from "./station.js";
import { windowedCheckPicker, type ProgressFn } from "./windowed.js";

const CHECK_CREG = "checks_c";

export function pickChecks(
  circuit: Circuit,
  targets: number[],
  noise: NoiseParam[],
  options: PickOptions = {},
  onProgress?: ProgressFn,
): PickResult {
  const nPayload = circuit.nqubits;
  const useStabilizers = options.useStabilizers ?? false;

  if (targets.some((t) => t < 0 || t >= nPayload)) {
    throw new Error(`Target qubits must be in [0, ${nPayload}).`);
  }
  const measuredQubits = [...new Set(circuit.measures.map((m) => m.qubit))];
  if (!useStabilizers && measuredQubits.length === 0) {
    throw new Error(
      "The circuit must contain at least one measurement (or enable input stabilizers).",
    );
  }
  if (!circuit.gates.some((g) => g.qubits.length >= 2)) {
    throw new Error(
      "The circuit has no entangling (2-qubit) gates; there is nothing to check.",
    );
  }
  if (noise.length === 0) throw new Error("The noise model may not be empty.");
  if (circuit.cregs.some((c) => c.name === CHECK_CREG)) {
    throw new Error(
      `The circuit already has a classical register named "${CHECK_CREG}".`,
    );
  }

  // Logical data: either input stabilizers (all-Z, forward-propagated) or the
  // measured qubits (Z back-propagated). Mutually exclusive; matches
  // station.py's stabilizers="all" shorthand (Z on each payload qubit, over the
  // full payload+ancilla width).
  const totNqbits = nPayload + targets.length;
  const stabilizers = useStabilizers
    ? Array.from({ length: nPayload }, (_, q) =>
        Array.from({ length: totNqbits }, (_, i) => (i === q ? "Z" : "I")).join(""),
      )
    : [];
  const pickerMeasured = useStabilizers ? [] : measuredQubits;

  const station = Station.create(
    circuit,
    targets.length,
    { kind: "gamma" },
    noise,
    pickerMeasured,
    stabilizers,
  );
  const res = windowedCheckPicker(station, targets, options, onProgress);

  const committed = res.committedTargets;
  const m = committed.length;
  const checkQubits = Array.from({ length: m }, (_, i) => nPayload + i);

  const variants: CheckedVariant[] = res.circuits.map((circ, k) => ({
    circuit: restoreMeasurements(
      circ,
      circuit.measures,
      circuit.cregs,
      nPayload,
      k,
      checkQubits,
    ),
    targetQubits: committed.slice(0, k),
    checkQubits: checkQubits.slice(0, k),
    checkSupport: res.virtualZs.slice(0, k),
    cost: res.costs[k],
  }));

  return { variants, committedTargets: committed };
}

/** Restore original measurements and add a `k`-bit check register to a variant. */
function restoreMeasurements(
  circ: Circuit,
  measures: Measure[],
  cregs: Creg[],
  nPayload: number,
  k: number,
  checkQubits: number[],
): Circuit {
  const width = nPayload + k;
  const gates = circ.gates.filter((g) => g.qubits.every((q) => q < width));
  const outCregs: Creg[] = cregs.map((c) => ({ ...c }));
  const outMeasures: Measure[] = measures.map((mm) => ({ ...mm }));

  if (k > 0) {
    outCregs.push({ name: CHECK_CREG, size: k });
    for (let j = 0; j < k; j++) {
      outMeasures.push({ qubit: checkQubits[j], creg: CHECK_CREG, bit: j });
    }
  }

  return { nqubits: width, gates, measures: outMeasures, cregs: outCregs };
}

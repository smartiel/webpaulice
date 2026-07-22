// Shared data types for the Paulice web app.

/** A single circuit instruction in the internal representation. */
export interface Gate {
  /** Qiskit-style lowercase gate name (e.g. "h", "cx", "cz", "s", "sx"). */
  name: string;
  /** Qubit indices the gate acts on. */
  qubits: number[];
  /** Optional numeric parameters (e.g. rz angle). */
  params?: number[];
}

/** A terminal measurement of a qubit into a classical register bit. */
export interface Measure {
  qubit: number;
  creg: string;
  bit: number;
}

/** A classical register declaration. */
export interface Creg {
  name: string;
  size: number;
}

/** The internal circuit representation (qiskit-like, gate list based). */
export interface Circuit {
  nqubits: number;
  gates: Gate[];
  measures: Measure[];
  cregs: Creg[];
}

/** A rustiq-style gate: `[name, qubits]`. */
export type RustiqGate = [string, number[]];

/** A wire reference `[gateIndex, slot]`; gateIndex === -1 is an input wire. */
export type Wire = [number, number];

/** An undirected coupling map: list of `[a, b]` edges. */
export type CouplingMap = [number, number][];

/** Noise channel parameters passed to the wasm layer. */
export type NoiseParam =
  | { kind: "uniform_depolarizing"; rate: number }
  | { kind: "readout"; rate: number };

/** Metric parameters passed to the wasm layer. */
export type MetricParam =
  | { kind: "gamma" }
  | { kind: "balanced_gamma" }
  | { kind: "logical_error_rate"; nshots: number };

/** One entry of the picker output: the circuit with the first k checks. */
export interface CheckedVariant {
  /** Circuit with k checks committed (internal representation). */
  circuit: Circuit;
  /** Target qubits that received a check (length k). */
  targetQubits: number[];
  /** Ancilla qubit indices holding the checks (length k). */
  checkQubits: number[];
  /** For each check, the qubit indices whose Z outcomes XOR to its syndrome. */
  checkSupport: number[][];
  /** Metric value after committing the first k checks. */
  cost: number;
}

/** Full picker result: bare circuit followed by one variant per committed check. */
export interface PickResult {
  variants: CheckedVariant[];
  committedTargets: number[];
}

/** Options controlling the windowed search. */
export interface PickOptions {
  ntries?: number;
  maxWidth?: number;
  paulis?: number[] | null;
  seed?: number | null;
  /**
   * Use the all-Z input stabilizer group as the logical data to protect
   * (assumes a |0…0⟩ input), instead of back-propagating Z from the measured
   * qubits. Mutually exclusive with measured-qubit mode in the core.
   */
  useStabilizers?: boolean;
}

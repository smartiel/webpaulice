// Port of qiskit_paulice/_internal/station.py (CheckPickerStation).
//
// A thin stateful wrapper around the wasm `WasmCheckPicker`, tracking the noise
// models / metric / ancilla index so the search can copy-and-commit exactly as
// the Python station does.

import { WasmCheckPicker } from "../wasm/paulice.js";
import type {
  Circuit,
  MetricParam,
  NoiseParam,
  RustiqGate,
  Wire,
} from "../types.js";
import { convertToInternal, convertToRustiq } from "./convert.js";

export class Station {
  picker: WasmCheckPicker;
  private noise: NoiseParam[];
  private metric: MetricParam;
  private ancilla: number;
  readonly totNqbits: number;

  private constructor(
    picker: WasmCheckPicker,
    noise: NoiseParam[],
    metric: MetricParam,
    ancilla: number,
    totNqbits: number,
  ) {
    this.picker = picker;
    this.noise = noise;
    this.metric = metric;
    this.ancilla = ancilla;
    this.totNqbits = totNqbits;
  }

  /**
   * Build a station for `circuit`, reserving `nChecksToAdd` ancilla slots. The
   * logical data is either `measuredQubits` (back-propagated Z) or `stabilizers`
   * (forward-propagated Pauli strings); exactly one should be non-empty.
   */
  static create(
    circuit: Circuit,
    nChecksToAdd: number,
    metric: MetricParam,
    noise: NoiseParam[],
    measuredQubits: number[],
    stabilizers: string[] = [],
  ): Station {
    const rustiq: RustiqGate[] = convertToRustiq(circuit);
    const totNqbits = circuit.nqubits + nChecksToAdd;
    const picker = new WasmCheckPicker(rustiq, totNqbits, measuredQubits, stabilizers);
    picker.set_evaluation_data(noise, metric, circuit.nqubits);
    return new Station(picker, noise, metric, circuit.nqubits, totNqbits);
  }

  getWires(qubit: number): Wire[] {
    return this.picker.get_wires(qubit) as Wire[];
  }

  setSupport(support: Wire[], paulis: number[], seed: number | null): void {
    this.picker.set_support(
      support,
      paulis,
      seed === null ? null : BigInt(seed),
    );
  }

  getDimension(): number {
    return this.picker.get_dimension();
  }

  evaluate(bv: boolean[]): number {
    return this.picker.evaluate(bv);
  }

  getCircuit(): Circuit {
    return convertToInternal(
      this.picker.get_circuit() as RustiqGate[],
      this.totNqbits,
    );
  }

  getVirtualZs(): number[][] {
    return this.picker.get_virtual_zs() as number[][];
  }

  getCurrentEnergy(): number {
    return this.picker.get_current_energy();
  }

  /** The committed ancilla indices and their virtual-Z supports. */
  getCheckData(): { checkQubits: number[]; virtualZs: number[][] } {
    const czs = this.getVirtualZs();
    const checkQubits = Array.from(
      { length: czs.length },
      (_, i) => this.totNqbits - czs.length + i,
    );
    return { checkQubits, virtualZs: czs };
  }

  copy(): Station {
    return new Station(
      this.picker.copy(),
      this.noise,
      this.metric,
      this.ancilla,
      this.totNqbits,
    );
  }

  /** Commit the check `bv`, returning a fresh station (this one is unchanged). */
  commitCheck(bv: boolean[]): Station {
    const newPicker = this.picker.commit_check_bv(bv);
    if (!newPicker) throw new Error("commit_check_bv produced no picker");
    const s = new Station(
      newPicker,
      this.noise,
      this.metric,
      this.ancilla + 1,
      this.totNqbits,
    );
    s.picker.set_evaluation_data(this.noise, this.metric, this.ancilla + 1);
    return s;
  }

  /** Explore candidate checks and commit the best; returns its cost or null. */
  findGoodCheck(): number | null {
    const res = this.picker.find_good_checks();
    if (!res) return null;
    const cost = res.cost;
    this.picker = res.take_picker();
    this.picker.set_evaluation_data(this.noise, this.metric, this.ancilla + 1);
    this.ancilla += 1;
    return cost;
  }
}

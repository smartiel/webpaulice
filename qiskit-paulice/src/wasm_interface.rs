// This code is part of Qiskit.
//
// (C) Copyright IBM 2026
//
// This code is licensed under the Apache License, Version 2.0. You may
// obtain a copy of this license in the LICENSE.txt file in the root directory
// of this source tree or at https://www.apache.org/licenses/LICENSE-2.0.
//
// Any modifications or derivative works of this code must retain this
// copyright notice, and modified files need to carry a notice indicating
// that they have been altered from the originals.

//! Browser (wasm-bindgen) bindings for the check picker.
//!
//! These mirror the low-level primitives that the Python `CheckPickerStation`
//! (python/qiskit_paulice/_internal/station.py) drives. The higher-level
//! orchestration (windowed search, etc.) is re-implemented in TypeScript on top
//! of this surface.
//!
//! Tuple-heavy values (wires as `(gate_index, slot)`, circuits as
//! `(name, qubits)`) are marshaled across the JS boundary with
//! `serde_wasm_bindgen`, which represents Rust tuples as fixed-length JS arrays.

use crate::check_picker::CheckPicker;
use crate::metric::PyMetric;
use crate::noise_model::NoiseModel;

use serde::Deserialize;
use wasm_bindgen::prelude::*;

/// A `(gate_index, slot)` wire reference. `gate_index == -1` denotes an input
/// wire (see `Wire::Input` in the core). Serializes to a 2-element JS array.
type WireJs = (i32, usize);

/// Install a panic hook so Rust panics surface as readable console errors.
#[wasm_bindgen]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// A single noise channel, chosen by `kind`. Only the two channels the web app
/// exposes are wired up here; extend as needed.
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum NoiseParam {
    UniformDepolarizing { rate: f64 },
    Readout { rate: f64 },
}

impl NoiseParam {
    fn build(self) -> NoiseModel {
        match self {
            NoiseParam::UniformDepolarizing { rate } => NoiseModel::uniform_depolarizing(rate),
            NoiseParam::Readout { rate } => NoiseModel::readout(rate),
        }
    }
}

/// The optimization metric, chosen by `kind`.
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum MetricParam {
    Gamma,
    BalancedGamma,
    LogicalErrorRate { nshots: usize },
}

impl MetricParam {
    fn build(self) -> PyMetric {
        match self {
            MetricParam::Gamma => PyMetric::gamma(),
            MetricParam::BalancedGamma => PyMetric::balanced_gamma(),
            MetricParam::LogicalErrorRate { nshots } => PyMetric::logical_error_rate(nshots),
        }
    }
}

fn de<T: for<'de> Deserialize<'de>>(v: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(v).map_err(|e| JsValue::from_str(&e.to_string()))
}

fn ser<T: serde::Serialize>(v: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(v).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// wasm-bindgen wrapper around the core `CheckPicker`.
#[wasm_bindgen]
pub struct WasmCheckPicker {
    inner: CheckPicker,
}

/// Result of `find_good_checks`: the committed picker plus its cost.
#[wasm_bindgen]
pub struct WasmFindResult {
    picker: Option<WasmCheckPicker>,
    cost: f64,
}

#[wasm_bindgen]
impl WasmFindResult {
    #[wasm_bindgen(getter)]
    pub fn cost(&self) -> f64 {
        self.cost
    }

    /// Take ownership of the committed picker (callable once).
    pub fn take_picker(&mut self) -> WasmCheckPicker {
        self.picker
            .take()
            .expect("take_picker called more than once")
    }
}

#[wasm_bindgen]
impl WasmCheckPicker {
    /// Build a picker from a rustiq-style circuit (`[[name, [qubits...]], ...]`),
    /// the total qubit count (payload + reserved check slots), the measured
    /// qubits, and any input stabilizers (as Pauli strings).
    #[wasm_bindgen(constructor)]
    pub fn new(
        circuit: JsValue,
        nqubits: usize,
        measured_qubits: JsValue,
        stabilizers: JsValue,
    ) -> Result<WasmCheckPicker, JsValue> {
        let circuit: Vec<(String, Vec<usize>)> = de(circuit)?;
        let measured_qubits: Vec<usize> = de(measured_qubits)?;
        let stabilizers: Vec<String> = de(stabilizers)?;
        let inner = CheckPicker::new(
            circuit,
            Some(nqubits),
            Some(measured_qubits),
            Some(stabilizers),
            None,
            None,
        );
        Ok(WasmCheckPicker { inner })
    }

    /// All wires belonging to a global qubit index (as `(gate_index, slot)`).
    pub fn get_wires(&self, qbit_index: usize) -> Result<JsValue, JsValue> {
        let wires: Vec<WireJs> = self.inner.get_wires(qbit_index);
        ser(&wires)
    }

    /// Set the noise models and metric used to score checks. `noise` is an array
    /// of `{kind, rate}` objects; `metric` is a `{kind, ...}` object.
    pub fn set_evaluation_data(
        &mut self,
        noise: JsValue,
        metric: JsValue,
        ancilla: usize,
    ) -> Result<(), JsValue> {
        let noise: Vec<NoiseParam> = de(noise)?;
        let metric: MetricParam = de(metric)?;
        let noise_models: Vec<NoiseModel> = noise.into_iter().map(NoiseParam::build).collect();
        self.inner
            .set_evaluation_data(noise_models, metric.build(), ancilla);
        Ok(())
    }

    /// Set the support (wires + Pauli types) for the next check search. `seed`
    /// (nullable) anchors the decoder's middle-wire choice.
    pub fn set_support(
        &mut self,
        wires: JsValue,
        paulis: JsValue,
        seed: Option<u64>,
    ) -> Result<(), JsValue> {
        let wires: Vec<WireJs> = de(wires)?;
        let paulis: Vec<u8> = de(paulis)?;
        self.inner.set_support(wires, paulis, seed);
        Ok(())
    }

    /// Dimension of the current check group (requires `set_support`).
    pub fn get_dimension(&self) -> usize {
        self.inner.get_dimension()
    }

    /// Score a check given by its bit-vector coordinates in the check group.
    pub fn evaluate(&self, bv: JsValue) -> Result<f64, JsValue> {
        let bv: Vec<bool> = de(bv)?;
        Ok(self.inner.evaluate(bv))
    }

    /// Commit the check specified by `bv`, returning the new picker.
    pub fn commit_check_bv(&self, bv: JsValue) -> Result<Option<WasmCheckPicker>, JsValue> {
        let bv: Vec<bool> = de(bv)?;
        Ok(self
            .inner
            .commit_check_bv(bv)
            .map(|inner| WasmCheckPicker { inner }))
    }

    /// Generate a few candidate checks over the current support and commit the
    /// best one. Returns `null` if the decoder found nothing.
    pub fn find_good_checks(&self) -> Option<WasmFindResult> {
        self.inner.find_good_checks().map(|(inner, cost)| WasmFindResult {
            picker: Some(WasmCheckPicker { inner }),
            cost,
        })
    }

    /// Current circuit as `[[name, [qubits...]], ...]`.
    pub fn get_circuit(&self) -> Result<JsValue, JsValue> {
        let circuit: Vec<(String, Vec<usize>)> = self.inner.get_circuit();
        ser(&circuit)
    }

    /// Virtual-Z support for each committed check (`[[qubit...], ...]`).
    pub fn get_virtual_zs(&self) -> Result<JsValue, JsValue> {
        let vzs: Vec<Vec<usize>> = self.inner.get_virtual_zs();
        ser(&vzs)
    }

    /// Current metric value.
    pub fn get_current_energy(&self) -> f64 {
        self.inner.get_current_energy()
    }

    /// Deep copy.
    pub fn copy(&self) -> WasmCheckPicker {
        WasmCheckPicker {
            inner: self.inner.copy(),
        }
    }

    /// Single-qubit Paulis not covered by the current checks, as
    /// `[[[gate_index, slot], pauli], ...]` with `pauli` in `1..=3` (X, Y, Z).
    pub fn get_uncovered_paulis(&self) -> Result<JsValue, JsValue> {
        let uncovered: Vec<(WireJs, u8)> = self.inner.get_uncovered_paulis();
        ser(&uncovered)
    }
}

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

#[cfg(feature = "python")]
use pyo3::prelude::*;

#[derive(Debug, Clone)]
pub enum Metric {
    LogicalErrorRate(usize),
    Gamma,
    BalancedGamma,
}

#[cfg_attr(feature = "python", pyclass(from_py_object))]
#[derive(Clone)]
pub struct PyMetric {
    pub _data: Metric,
}
// WeightedCoverage,
// LogicalErrorRate(usize),
// PsrLer(f64, f64, usize),
// CumulantSize,
// GammaApx(),
// pyo3's `#[pymethods]` cannot process `cfg_attr`-wrapped `#[staticmethod]`/`#[new]`
// modifier attributes, so the bindings are split into two cfg-exclusive impl
// blocks: the Python one is kept identical to the original, and a plain twin is
// compiled for the wasm build.
#[cfg(feature = "python")]
#[pymethods]
impl PyMetric {
    #[staticmethod]
    pub fn logical_error_rate(nshots: usize) -> Self {
        Self {
            _data: Metric::LogicalErrorRate(nshots),
        }
    }

    #[staticmethod]
    pub fn gamma() -> Self {
        Self {
            _data: Metric::Gamma,
        }
    }
    #[staticmethod]
    pub fn balanced_gamma() -> Self {
        Self {
            _data: Metric::BalancedGamma,
        }
    }
}

#[cfg(not(feature = "python"))]
impl PyMetric {
    pub fn logical_error_rate(nshots: usize) -> Self {
        Self {
            _data: Metric::LogicalErrorRate(nshots),
        }
    }

    pub fn gamma() -> Self {
        Self {
            _data: Metric::Gamma,
        }
    }

    pub fn balanced_gamma() -> Self {
        Self {
            _data: Metric::BalancedGamma,
        }
    }
}

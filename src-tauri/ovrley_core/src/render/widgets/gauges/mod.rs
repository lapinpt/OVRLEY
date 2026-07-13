//! Shared gauge infrastructure.
//!
//! Gauge renderers share telemetry range derivation, label formatting, and the
//! translated low-fill cap. Arc bodies and ordinary linear RRects retain their
//! own geometry.

pub mod arc;
pub(crate) mod labels;
pub mod linear;
pub(crate) mod range;
pub(crate) mod track_path;

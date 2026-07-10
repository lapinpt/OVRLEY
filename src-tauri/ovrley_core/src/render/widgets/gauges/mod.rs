//! Shared gauge infrastructure.
//!
//! Gauge renderers share telemetry range derivation and label formatting, but
//! retain their own geometry. Arc-specific path construction is deliberately
//! separate from linear RRect geometry.

pub mod arc;
pub(crate) mod labels;
pub mod linear;
pub(crate) mod range;

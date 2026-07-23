use crate::render::format::format_lean_angle_value;
use crate::render::widgets::lean_angle::{
    lean_angle_fill_sweep, lean_angle_geometry, lean_angle_inner_geometry, lean_angle_track_width,
};

#[test]
fn lean_angle_sector_is_centered_and_fits_the_default_frame() {
    let geometry = lean_angle_geometry(180.0, 140.0, 24.0);

    assert_eq!(geometry.start_angle, 210.0);
    assert_eq!(geometry.sweep_angle, 120.0);
    assert_eq!(geometry.center_x, 90.0);
    assert_eq!(geometry.center_y, 70.0);
    assert_eq!(geometry.outer_radius, 66.0);
    assert!(geometry.outer_radius < 70.0);
}

#[test]
fn lean_angle_inner_radius_respects_track_thickness() {
    let geometry = lean_angle_geometry(180.0, 140.0, 24.0);

    assert_eq!(geometry.outer_radius, 66.0);
    assert_eq!(geometry.inner_radius, 42.0);
    assert_eq!(geometry.outer_radius - geometry.inner_radius, 24.0);

    let inner = lean_angle_inner_geometry(geometry, 2.0);
    assert_eq!(inner.outer_radius, 64.0);
    assert_eq!(inner.inner_radius, 44.0);
    assert_eq!(inner.outer_radius - inner.inner_radius, 20.0);
    assert_eq!(lean_angle_track_width(24.0, 2.0), 20.0);
}

#[test]
fn lean_angle_maps_signed_samples_and_formats_missing_values() {
    assert_eq!(lean_angle_fill_sweep(Some(30.0)), 30.0);
    assert_eq!(lean_angle_fill_sweep(Some(-70.0)), -60.0);
    assert_eq!(lean_angle_fill_sweep(Some(0.0)), 0.0);
    assert_eq!(lean_angle_fill_sweep(None), 0.0);
    assert_eq!(format_lean_angle_value(Some(-30.4)), "30");
    assert_eq!(format_lean_angle_value(None), "--");
}

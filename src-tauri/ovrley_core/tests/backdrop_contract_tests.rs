mod common;

use ovrley_core::activity::schema::ParsedActivity;
use ovrley_core::commands::validate_config_value;
use ovrley_core::debug::RenderProfiler;
use ovrley_core::normalize::parse_config_value;
use ovrley_core::paths::AppPaths;
use ovrley_core::render::{prepare_base_rgba, prepare_preview_assets, LabelCacheStatus};
use ovrley_core::standard_widgets::{
    backdrop_type_definition, backdrop_type_label, default_backdrop_display_types,
    gradient_widget_definition, is_backdrop_type_supported, label_widget_definition,
    plot_widget_definition,
};
use ovrley_core::BackdropType;
use serde_json::json;
use std::path::PathBuf;

#[test]
fn standard_widgets_manifest_exposes_legacy_sections_through_definitions() {
    let course = plot_widget_definition("course").expect("course plot definition");
    assert_eq!(course.label, "Course");
    assert_eq!(course.defaults["value"], "course");
    assert_eq!(course.defaults["width"], 400);

    let elevation = plot_widget_definition("elevation").expect("elevation plot definition");
    assert_eq!(elevation.label, "Elevation");
    assert_eq!(elevation.defaults["point_label"]["font"], "Arial.ttf");

    let gradient = gradient_widget_definition("gradient").expect("gradient definition");
    assert_eq!(gradient.label, "Gradient");
    assert_eq!(gradient.defaults["triangle_width"], 72);

    let label = label_widget_definition("label").expect("label definition");
    assert_eq!(label.label, "Text");
    assert_eq!(label.defaults["text"], "New Text");
}

#[test]
fn backdrop_manifest_exposes_expected_types_and_defaults() {
    assert_eq!(default_backdrop_display_types(), ["rectangle"]);
    assert!(is_backdrop_type_supported("circle"));
    assert!(is_backdrop_type_supported("rectangle"));
    assert!(!is_backdrop_type_supported("triangle"));
    assert_eq!(backdrop_type_label("circle"), "Circle");
    assert_eq!(backdrop_type_label("unknown"), "unknown");

    let circle = backdrop_type_definition("circle").expect("circle backdrop definition");
    assert_eq!(
        circle.defaults,
        json!({
            "display_type": "circle",
            "x": 100,
            "y": 100,
            "opacity": 1,
            "diameter": 200,
            "fill_color": "#ffffff",
            "fill_opacity": 1,
            "border_thickness": 0,
            "border_color": "#ffffff",
            "border_opacity": 1
        })
    );

    let rectangle = backdrop_type_definition("rectangle").expect("rectangle backdrop definition");
    assert_eq!(
        rectangle.defaults,
        json!({
            "display_type": "rectangle",
            "x": 100,
            "y": 100,
            "opacity": 1,
            "width": 200,
            "height": 120,
            "fill_color": "#ffffff",
            "fill_opacity": 1,
            "border_thickness": 0,
            "border_color": "#ffffff",
            "border_opacity": 1,
            "corner_radius": 0,
            "round_top_left": false,
            "round_top_right": false,
            "round_bottom_left": false,
            "round_bottom_right": false
        })
    );
}

#[test]
fn backdrop_type_deserializes_strictly() {
    assert_eq!(
        serde_json::from_str::<BackdropType>(r#""circle""#).unwrap(),
        BackdropType::Circle
    );
    assert_eq!(
        serde_json::from_str::<BackdropType>(r#""rectangle""#).unwrap(),
        BackdropType::Rectangle
    );
    assert!(serde_json::from_str::<BackdropType>(r#""triangle""#).is_err());
    assert!(serde_json::from_str::<BackdropType>("null").is_err());
}

#[test]
fn missing_backdrops_loads_as_empty_list() {
    let raw = parse_config_value(&json!({
        "scene": common::seam::explicit_scene_json(),
        "labels": [],
        "values": [],
        "plots": []
    }))
    .unwrap();
    assert!(raw.backdrops.is_empty());

    let validated = validate_config_value(&json!({
        "scene": common::seam::explicit_scene_json(),
        "labels": [],
        "values": [],
        "plots": []
    }))
    .unwrap();
    assert!(validated.backdrops.is_empty());
}

#[test]
fn valid_rectangle_backdrop_promotes_and_validates_active_variant() {
    let validated = validate_config_value(&json!({
        "scene": common::seam::explicit_scene_json(),
        "backdrops": [{
            "id": "backdrop-1",
            "x": 10,
            "y": 20,
            "opacity": 0.75,
            "display_type": "rectangle",
            "fill_color": "#112233",
            "fill_opacity": 0.5,
            "border_thickness": 2,
            "border_color": "#445566",
            "border_opacity": 0.25,
            "display_variants": {
                "rectangle": {
                    "width": 100,
                    "height": 60,
                    "corner_radius": 12,
                    "round_top_left": true,
                    "round_top_right": false,
                    "round_bottom_left": true,
                    "round_bottom_right": false
                }
            }
        }],
        "labels": [],
        "values": [],
        "plots": []
    }))
    .unwrap();

    let backdrop = &validated.backdrops[0];
    assert_eq!(backdrop.id, "backdrop-1");
    assert_eq!(backdrop.display_type, BackdropType::Rectangle);
    assert_eq!(backdrop.width, 100);
    assert_eq!(backdrop.height, 60);
    assert_eq!(backdrop.corner_radius, 12.0);
    assert!(backdrop.round_top_left);
    assert!(!backdrop.round_top_right);
    assert_eq!(backdrop.fill_color, "#112233");
    assert_eq!(backdrop.border_color, "#445566");
}

#[test]
fn backdrop_styling_fields_are_required() {
    let result = validate_config_value(&json!({
        "scene": common::seam::explicit_scene_json(),
        "backdrops": [{
            "id": "backdrop-1",
            "x": 10,
            "y": 20,
            "opacity": 1,
            "display_type": "circle",
            "fill_opacity": 1,
            "border_thickness": 0,
            "border_color": "#ffffff",
            "border_opacity": 1,
            "display_variants": {
                "circle": {
                    "diameter": 100
                }
            }
        }],
        "labels": [],
        "values": [],
        "plots": []
    }));

    let Err(error) = result else {
        panic!("missing fill_color should be rejected");
    };

    assert!(
        error.to_string().contains("backdrops[0].fill_color"),
        "got: {error}"
    );
}

#[test]
fn static_base_rgba_renders_rectangle_backdrop() {
    let validated = validate_config_value(&json!({
        "scene": small_scene_json(32, 24),
        "backdrops": [rectangle_backdrop_json("static-base-rect", "#ff0000")],
        "labels": [],
        "values": [],
        "plots": []
    }))
    .unwrap();
    let mut profiler = RenderProfiler::default();
    let pixels = prepare_base_rgba(
        &test_paths(),
        &validated.backdrops,
        &validated.labels,
        &validated.values,
        &validated.scene,
        &mut profiler,
    )
    .unwrap()
    .unwrap();

    assert_eq!(rgba_at(&pixels, 32, 8, 8), [255, 0, 0, 255]);
    assert_eq!(rgba_at(&pixels, 32, 24, 20), [0, 0, 0, 0]);
}

#[test]
fn static_cache_key_includes_backdrops() {
    let paths = test_paths();
    let activity: ParsedActivity = serde_json::from_value(json!({})).unwrap();
    let dense = common::builders::minimal_dense_activity();
    let first_config = validate_config_value(&json!({
        "scene": small_scene_json(53, 47),
        "backdrops": [rectangle_backdrop_json("cache-rect", "#ff0000")],
        "labels": [],
        "values": [],
        "plots": []
    }))
    .unwrap();
    let second_config = validate_config_value(&json!({
        "scene": small_scene_json(53, 47),
        "backdrops": [rectangle_backdrop_json("cache-rect", "#0000ff")],
        "labels": [],
        "values": [],
        "plots": []
    }))
    .unwrap();

    let (_, first_status, _, _) =
        prepare_preview_assets(&paths, &first_config, &activity, &dense).unwrap();
    let (_, second_status, _, _) =
        prepare_preview_assets(&paths, &first_config, &activity, &dense).unwrap();
    let (_, changed_status, _, _) =
        prepare_preview_assets(&paths, &second_config, &activity, &dense).unwrap();

    assert!(matches!(first_status, LabelCacheStatus::Miss));
    assert!(matches!(second_status, LabelCacheStatus::Hit));
    assert!(matches!(changed_status, LabelCacheStatus::Miss));
}

fn small_scene_json(width: u32, height: u32) -> serde_json::Value {
    let mut scene = common::seam::explicit_scene_json();
    scene["width"] = json!(width);
    scene["height"] = json!(height);
    scene
}

fn rectangle_backdrop_json(id: &str, fill_color: &str) -> serde_json::Value {
    json!({
        "id": id,
        "x": 4,
        "y": 5,
        "opacity": 1,
        "display_type": "rectangle",
        "fill_color": fill_color,
        "fill_opacity": 1,
        "border_thickness": 0,
        "border_color": "#ffffff",
        "border_opacity": 1,
        "display_variants": {
            "rectangle": {
                "width": 12,
                "height": 10,
                "corner_radius": 0,
                "round_top_left": false,
                "round_top_right": false,
                "round_bottom_left": false,
                "round_bottom_right": false
            }
        }
    })
}

fn rgba_at(pixels: &[u8], width: usize, x: usize, y: usize) -> [u8; 4] {
    let offset = (y * width + x) * 4;
    [
        pixels[offset],
        pixels[offset + 1],
        pixels[offset + 2],
        pixels[offset + 3],
    ]
}

fn test_paths() -> AppPaths {
    let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();
    AppPaths {
        repo_root: workspace_root.clone(),
        font_dirs: vec![workspace_root.join("fonts")],
        debug_render_dir: std::env::temp_dir(),
        temp_dir: std::env::temp_dir(),
        bundled_templates_dirs: vec![],
        user_templates_dir: std::env::temp_dir(),
        downloads_dir: std::env::temp_dir(),
    }
}

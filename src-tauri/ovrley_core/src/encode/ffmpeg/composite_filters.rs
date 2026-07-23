//! Composite filter-graph and input-validation helpers.

use crate::encode::ffmpeg::catalog::{CompositeCodecId, CompositeFilterStackKind};
use crate::error::CoreResult;

use super::composite::CompositeProfile;

const CUDA_FRAME_ALIGNMENT: u32 = 32;

/// Returns codec-specific metadata that hides CUDA's aligned frame overhang.
///
/// Composite dimensions are display-oriented before this point. Sources with
/// 90/270-degree rotation metadata have already been transposed, so portrait
/// crops apply to the aligned right edge rather than the source's coded bottom.
pub(super) fn cuda_display_metadata_filter(
    codec_id: CompositeCodecId,
    display_width: u32,
    display_height: u32,
) -> Option<String> {
    match codec_id {
        CompositeCodecId::NnvgpuH264 => {
            let crop_right = cuda_frame_overhang(display_width);
            let crop_bottom = cuda_frame_overhang(display_height);
            (crop_right != 0 || crop_bottom != 0)
                .then(|| format!("h264_metadata=crop_right={crop_right}:crop_bottom={crop_bottom}"))
        }
        CompositeCodecId::NnvgpuHevc => Some(format!(
            "hevc_metadata=width={display_width}:height={display_height}"
        )),
        _ => None,
    }
}

fn cuda_frame_overhang(dimension: u32) -> u32 {
    (CUDA_FRAME_ALIGNMENT - dimension % CUDA_FRAME_ALIGNMENT) % CUDA_FRAME_ALIGNMENT
}

/// Chooses FFmpeg's raw-overlay input queue size from frame dimensions.
///
/// The queued units are raw RGBA frames, so memory cost scales with pixel area:
/// 8K frames are large enough that FFmpeg should expose backpressure quickly.
pub(super) fn composite_overlay_thread_queue_size(width: u32, height: u32) -> usize {
    const FULL_HD_PIXELS: u64 = 1920 * 1080;
    const UHD_4K_PIXELS: u64 = 3840 * 2160;

    let pixels = u64::from(width) * u64::from(height);
    if pixels <= FULL_HD_PIXELS {
        64
    } else if pixels <= UHD_4K_PIXELS {
        16
    } else {
        4
    }
}

/// Builds the selected profile's composite filter graph.
///
/// Profile templates use `{base_video_filters}`, `{width}`, and `{height}`
/// placeholders. The base-video filter chain owns exact video trimming so the
/// decoded frame boundary matches the render plan more closely than input-side
/// seek alone.
pub(super) fn composite_filter_complex(
    width: u32,
    height: u32,
    video_trim_start: f64,
    render_duration: f64,
    profile: &CompositeProfile,
    source_rotation_filter: Option<&'static str>,
) -> CoreResult<String> {
    let template = profile
        .filter_complex
        .as_deref()
        .expect("composite profile catalog defines a filter graph");
    let mut base_video_filters = format!(
        "trim=start={}:end={},setpts=PTS-STARTPTS,",
        format_seconds_arg(video_trim_start),
        format_seconds_arg(video_trim_start + render_duration),
    );
    if let Some(rotation_filter) = source_rotation_filter {
        base_video_filters.push_str(rotation_filter);
        base_video_filters.push_str("sidedata=mode=delete:type=DISPLAYMATRIX,");
    }
    Ok(template
        .replace("{base_video_filters}", &base_video_filters)
        .replace("{width}", &width.to_string())
        .replace("{height}", &height.to_string()))
}

pub(super) fn source_rotation_filter(
    rotation_degrees: Option<i32>,
    filter_stack_kind: CompositeFilterStackKind,
) -> Option<&'static str> {
    match rotation_degrees.map(|degrees| degrees.rem_euclid(360)) {
        Some(90) => {
            if matches!(filter_stack_kind, CompositeFilterStackKind::CudaOverlay) {
                Some("transpose_cuda=2,")
            } else if matches!(filter_stack_kind, CompositeFilterStackKind::QsvFullOverlay) {
                Some("vpp_qsv=transpose=2,")
            } else if matches!(filter_stack_kind, CompositeFilterStackKind::VaapiOverlay) {
                Some("transpose_vaapi=2,")
            } else {
                Some("transpose=2,")
            }
        }
        Some(180) => {
            if matches!(filter_stack_kind, CompositeFilterStackKind::CudaOverlay) {
                Some("transpose_cuda=4,")
            } else if matches!(filter_stack_kind, CompositeFilterStackKind::QsvFullOverlay) {
                Some("vpp_qsv=transpose=4,")
            } else if matches!(filter_stack_kind, CompositeFilterStackKind::VaapiOverlay) {
                Some("transpose_vaapi=4,")
            } else {
                Some("hflip,vflip,")
            }
        }
        Some(270) => {
            if matches!(filter_stack_kind, CompositeFilterStackKind::CudaOverlay) {
                Some("transpose_cuda=1,")
            } else if matches!(filter_stack_kind, CompositeFilterStackKind::QsvFullOverlay) {
                Some("vpp_qsv=transpose=1,")
            } else if matches!(filter_stack_kind, CompositeFilterStackKind::VaapiOverlay) {
                Some("transpose_vaapi=1,")
            } else {
                Some("transpose=1,")
            }
        }
        _ => None,
    }
}

/// Formats seconds for FFmpeg while trimming insignificant decimal zeros.
///
/// This keeps integer trim values readable as `10` while preserving fractional
/// durations when callers pass non-integer values.
pub(super) fn format_seconds_arg(value: f64) -> String {
    if value.fract().abs() <= f64::EPSILON {
        return format!("{}", value.trunc() as i64);
    }
    let formatted = format!("{value:.6}");
    formatted
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_string()
}

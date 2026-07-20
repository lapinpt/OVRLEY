//! Editable FFmpeg command templates for transparent-overlay encoder profiles.
//!
//! Owns: static default-profile data for transparent overlay exports, including
//!       profile lookup and FFmpeg command fragments.
//! Does not own: JSON parsing, container overrides, or final `FfmpegSettings`
//!       assembly. Those remain in [`crate::encode::ffmpeg_settings`].

use super::codec_catalog::{transparent_codec, EncoderId};

/// Selects the BT.709 RGB-to-YUV matrix around the Vulkan conversion.
pub const PRORES_KS_VULKAN_FILTER: &str = "setparams=colorspace=bt709,hwupload,scale_vulkan=format=yuva444p10le:out_range=tv,setparams=colorspace=bt709";

/// One fully expanded transparent profile ready for builder assembly.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TransparentProfile {
    pub name: &'static str,
    pub encoder_id: EncoderId,
    /// Logical CPU cores reserved for each frame-render worker. Zero forces one worker.
    pub cpu_cores_per_frame_worker: usize,
    pub input_args: &'static [&'static str],
    pub filter_complex: Option<&'static str>,
    pub output_args: &'static [&'static str],
}

const BUILTIN_PROFILES: &[TransparentProfile] = &[
    TransparentProfile {
        name: "prores_ks",
        encoder_id: EncoderId::ProresKs,
        cpu_cores_per_frame_worker: 0,
        input_args: &[],
        filter_complex: None,
        output_args: &[
            "-threads",
            "0",
            "-profile:v",
            "4444",
            "-qscale:v",
            "5",
            "-f",
            "mov",
            "-pix_fmt",
            "yuva444p10le",
        ],
    },
    TransparentProfile {
        name: "prores_ks_vulkan",
        encoder_id: EncoderId::ProresKsVulkan,
        cpu_cores_per_frame_worker: 4,
        input_args: &["-init_hw_device", "vulkan=vk", "-filter_hw_device", "vk"],
        filter_complex: Some(PRORES_KS_VULKAN_FILTER),
        output_args: &[
            "-profile:v",
            "4",
            "-mbs_per_slice",
            "8",
            "-vendor",
            "apl0",
            "-alpha_bits",
            "8",
            "-f",
            "mov",
            "-pix_fmt",
            "vulkan",
        ],
    },
    TransparentProfile {
        name: "prores_videotoolbox",
        encoder_id: EncoderId::ProresVideotoolbox,
        cpu_cores_per_frame_worker: 0,
        input_args: &[],
        filter_complex: None,
        output_args: &["-profile:v", "4", "-f", "mov", "-pix_fmt", "yuva444p10le"],
    },
    TransparentProfile {
        name: "qtrle",
        encoder_id: EncoderId::Qtrle,
        cpu_cores_per_frame_worker: 6,
        input_args: &[],
        filter_complex: None,
        output_args: &["-f", "mov", "-pix_fmt", "argb"],
    },
];

/// Resolves and expands one transparent encoder profile.
///
/// The lookup accepts any alias owned by the canonical codec catalog, then
/// returns the canonical static profile entry for the settings builder.
pub fn transparent_profile(name_or_codec: &str) -> Option<&'static TransparentProfile> {
    let normalized = transparent_codec(name_or_codec)
        .map(|metadata| metadata.encoder_id.metadata().ffmpeg_name)
        .unwrap_or(name_or_codec);

    BUILTIN_PROFILES.iter().find(|profile| {
        profile.name == normalized || profile.encoder_id.metadata().ffmpeg_name == normalized
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profiles_define_frame_worker_cpu_costs() {
        let costs = BUILTIN_PROFILES
            .iter()
            .map(|profile| (profile.name, profile.cpu_cores_per_frame_worker))
            .collect::<Vec<_>>();

        assert_eq!(
            costs,
            vec![
                ("prores_ks", 0),
                ("prores_ks_vulkan", 3),
                ("prores_videotoolbox", 0),
                ("qtrle", 4),
            ]
        );
    }
}

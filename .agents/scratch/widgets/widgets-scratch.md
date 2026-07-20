The following widgets must be implemented in the manifest, frontend jsx preview and backend Rust contract/renderer. All these widgets are metric widgets of display_type text, so the architecture and design is mostly set. Some may contain specific formatting settings/options. Parsing and/or derivation in finalize activity must also be included where indicated:

- **Calories:** Must be parsed only from fit-parser and gpx extensions. Do not derive. Icon must be a flame icon, like here, but without the text/labe: https://static.vecteezy.com/system/resources/previews/060/183/274/non_2x/calorie-burn-icon-fire-flame-and-kcal-symbol-in-black-vector.jpg. Unit is kcal. Category others.
- **GPS coordinates:** Dropdown with 3 options - latitude, longitude, both. Two formats - DDS, DMS. GPS coordinates already exist in finalized activity, no need to parse. The unit color controls the color of N,S,W,E. Symbols for degrees, minutes and seconds are the same color/string as the digits. If option 'both' is picked, latitude and longitude are displayed in 40% font size above each other with small vertical gap. Icon must be exact copy of Lucide's 'satellite'. Category general.
- **Distance to home:** Units are meters, kilometers, miles. Must be derived in finalize activity from GPS coordinates and the initial gps coordinate. Do any formats, e.g. srt natively supply 'distance to home'? Icon must be exact copy of Lucide's 'icon'. Category other. How do drones typically calculated this? Do they take elevation into account? Do they take distance between two projected gps coordinates? What's the industry standard?
- **Total ascent:** Units are meters, feet. Must be derived in finalize activity from altitude/elevation. How do we calculate this, just by adding difference between altitude/elevation points if the difference is positive? Is there a better way? Do fit files and/or gpx (in extensions) ever supply this directly? Similar to 'distance' widget, provide a switch to toggle total ascent which shows after a slash. Icon must be exact copy of Lucide's 'arrow-up-narrow-wide'. Category general.

pipeline/composite.rs render_composite_video 192
pipeline/composite_plan.rs derive_composite_render_plan 120
pipeline/frames.rs render_frames_parallel 318
pipeline/transparent.rs render_video 205
ffmpeg/composite.rs build_composite_ffmpeg_settings 161
ffmpeg/detect.rs detect_codecs 111

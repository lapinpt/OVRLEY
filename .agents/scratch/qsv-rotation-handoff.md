# QSV rotation handoff

Implement this only for `qsv_full`.

The DXVA2-backed QSV path can decode, scale, upload the RGBA overlay, and composite zero-copy, but its `vpp_qsv` rotation/flip operation is unsupported and silently leaves the main video in coded orientation. Do not rotate or download the main QSV frames.

Instead:

- Keep the main video `-noautorotate` and QSV-native.
- Rotate the CPU-side RGBA overlay by the inverse of the source display-matrix angle before `hwupload`.
- Make the overlay transform angle-agnostic: no-op for 0°, inverse quarter-turn for 90°/270°, and a 180° flip for 180°.
- Keep the output display matrix equal to the source matrix so it rotates the completed composite, including the pre-rotated overlay.
- Do not delete `DISPLAYMATRIX` and do not force `rotate=0` for this QSV path.
- Leave software, CUDA, VAAPI, and other encoder paths unchanged.

The overlay is already CPU-resident, so this preserves the zero-copy main-video/composite/encode path. Update the existing relevant QSV command tests only; do not add a new test suite.

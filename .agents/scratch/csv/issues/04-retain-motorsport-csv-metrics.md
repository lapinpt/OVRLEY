# Retain motorsport controls, engine, lean, and acceleration metrics

Status: ready-for-human  
Type: AFK

## Specification

Understand the full feature spec and the design decisions:

- scratch/csv/spec_codex.md
- scratch/csv/PRD.md

## What to build

Extend the canonical finalized activity and the working CSV import path with g-force x/y/z, RPM, throttle position, brake position, and lean angle. Select the agreed vehicle sources, normalize control positions, preserve signed lean and acceleration axes, and produce scalar g-force from the best available source or the agreed fallback calculation.

The new series must be present in finalized activities for future work but remain outside renderer trimming, dense reports, manifests, widgets, and frontend formatting in this slice.

## User stories covered

12, 13, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 45

## Acceptance criteria

- [x] `ActivityColumns` and `ParsedActivity` explicitly retain `g_force_x`, `g_force_y`, `g_force_z`, `rpm`, `throttle_position`, `brake_position`, and `lean_angle`.
- [x] The new series participate in aligned-length validation, direct metric collection, units, coverage, extended attributes, and finalized activity assembly.
- [x] RPM remains distinct from cadence.
- [x] Logger/CAN/OBD vehicle sources are preferred for RPM, throttle, brake, and gear; accelerator-pedal position wins over generic throttle-body position.
- [x] Percentage control sources remain percentages, binary sources become 0%/100%, and ambiguous unitless all-zero/one columns use one binary interpretation for the entire column.
- [x] Brake pressure is ignored rather than mapped to brake position.
- [x] Semantic acceleration maps lateral to x, longitudinal/inline to y, and vertical to z; literal X/Y/Z preserves source signs without rotation.
- [x] Direct scalar/combined acceleration wins over derivation; lateral/longitudinal and gravity-compensated x/y/z fallbacks use the agreed zero-at-rest formulas.
- [x] Signed lean angles are retained without circular normalization.
- [x] Fixture integration tests prove the correct new series are populated and contain only finite values or missing samples.
- [x] No renderer, manifest, widget, trim, or dense-report support is added for the new metrics.

## Blocked by

- `03-normalize-csv-timing-and-distance.md`

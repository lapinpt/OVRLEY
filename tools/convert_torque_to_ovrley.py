#!/usr/bin/env python3
"""Convert the observed Torque ``trackLog`` CSV schema into generic OVRLEY CSV.

This is intentionally an external conversion tool.  It does not change
OVRLEY's Torque importer and writes headers understood by the generic CSV
importer.  ``Torque (Nm)`` is retained as an extra converted column for users
and future importer support; the current generic importer does not consume it.
"""

from __future__ import annotations

import argparse
import csv
import math
import statistics
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Sequence


FT_LB_TO_NM = 1.355_817_948_331_400_4
MISSING_VALUES = {"", "-"}

PRIMARY_RATIO = 2.095
FINAL_DRIVE_RATIO = 48.0 / 15.0
GEAR_RATIOS = {1: 2.353, 2: 1.714, 3: 1.333, 4: 1.111, 5: 0.966, 6: 0.852}
MIN_GEAR_SPEED_KMH = 15.0
MIN_GEAR_RPM = 1_200.0
MAX_GEAR_RELATIVE_ERROR = 0.08
CALIBRATION_SCALE_MIN = 6.5
CALIBRATION_SCALE_MAX = 11.0
MIN_CALIBRATION_SAMPLES = 20
MIN_CALIBRATION_CONFIDENCE = 0.70

OUTPUT_COLUMNS = (
    "Elapsed Time (s)",
    "Latitude",
    "Longitude",
    "Speed (km/h)",
    "Altitude (m)",
    "Engine RPM (rpm)",
    "Throttle Position (%)",
    "Torque (Nm)",
    "Distance (km)",
    "Gear",
)

REQUIRED_HEADERS = (
    "Device Time",
    "Latitude",
    "Longitude",
    "GPS Speed(km/h)",
    "GPS Altitude(m)",
    "Engine RPM(rpm)",
    "Throttle Position(Manifold)(%)",
    "Torque(ft-lb)",
    "Trip Distance(km)",
)

SAFE_ACCELERATION_HEADERS: frozenset[str] = frozenset()


class ConversionError(ValueError):
    """The source cannot be represented safely by this converter."""


@dataclass(frozen=True)
class GearAnalysis:
    available_header: str | None
    eligible_samples: int
    clusters: tuple[tuple[float, int], ...]
    inferable: bool
    reason: str
    transmission_scale: float | None = None
    inferred_samples: int = 0


@dataclass(frozen=True)
class ConversionSummary:
    input_rows: int
    output_rows: int
    mapped_columns: tuple[str, ...]
    ignored_columns: tuple[str, ...]
    unsupported_columns: tuple[str, ...]
    gear: GearAnalysis


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "input",
        type=Path,
        nargs="?",
        default=Path("_samples/torque/trackLog-torque.csv"),
        help="Torque trackLog CSV (default: %(default)s)",
    )
    parser.add_argument("output", type=Path, help="new OVRLEY-compatible CSV path")
    return parser.parse_args(argv)


def read_source(path: Path) -> tuple[list[str], list[list[str]]]:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            rows = list(csv.reader(source))
    except OSError as error:
        raise ConversionError(f"Cannot read {path}: {error}") from error

    if not rows:
        raise ConversionError(f"{path} is empty")
    header = [value.strip() for value in rows[0]]
    if not header or any(not value.strip() for value in header):
        raise ConversionError(f"{path} has an empty source header")
    if len(set(header)) != len(header):
        raise ConversionError(f"{path} has duplicate source headers")

    width = len(header)
    data = []
    for line_number, row in enumerate(rows[1:], start=2):
        if not any(value.strip() for value in row):
            continue
        if len(row) != width:
            raise ConversionError(
                f"{path} row {line_number} has {len(row)} cells; expected {width}"
            )
        data.append(row)
    if len(data) < 2:
        raise ConversionError(f"{path} needs at least two data rows")
    return header, data


def validate_headers(headers: Iterable[str]) -> None:
    available = set(headers)
    missing = [header for header in REQUIRED_HEADERS if header not in available]
    if missing:
        raise ConversionError("Missing required supported headers: " + ", ".join(missing))

    unsupported = [
        header
        for header in available
        if header.startswith("GPS Speed") and header != "GPS Speed(km/h)"
    ]
    if unsupported:
        raise ConversionError(
            "Unsupported GPS Speed unit/header: " + ", ".join(sorted(unsupported))
        )


def parse_device_time(value: str, line_number: int) -> datetime:
    """Parse only the observed Portuguese-August Device Time contract."""
    raw = value.strip()
    if raw in MISSING_VALUES:
        raise ConversionError(f"row {line_number} has a missing Device Time")
    normalized = raw.replace("-ago.-", "-08-")
    try:
        return datetime.strptime(normalized, "%d-%m-%Y %H:%M:%S.%f")
    except ValueError as error:
        raise ConversionError(
            f"row {line_number} has unsupported Device Time {raw!r}; "
            "expected DD-ago.-YYYY HH:MM:SS.mmm"
        ) from error


def parse_optional_number(value: str, column: str, line_number: int) -> float | None:
    raw = value.strip()
    if raw in MISSING_VALUES:
        return None
    try:
        parsed = float(raw)
    except ValueError as error:
        raise ConversionError(f"row {line_number} {column} is not numeric: {raw!r}") from error
    if not math.isfinite(parsed):
        raise ConversionError(f"row {line_number} {column} is not finite")
    return parsed


def require_range(value: float | None, column: str, line_number: int, low: float, high: float) -> float | None:
    if value is not None and not low <= value <= high:
        raise ConversionError(f"row {line_number} {column} is outside [{low}, {high}]")
    return value


def format_number(value: float | None) -> str:
    return "" if value is None else format(value, ".12g")


def drive_ratio(gear: int) -> float:
    return PRIMARY_RATIO * FINAL_DRIVE_RATIO * GEAR_RATIOS[gear]


def expected_rpm(speed_kmh: float, gear: int, transmission_scale: float) -> float:
    """Return the theoretical engine RPM for a speed and selected gear.

    ``transmission_scale`` is calibrated from the fixture's RPM/speed samples.
    It accounts for wheel circumference without assuming a tyre size.
    """
    return speed_kmh * drive_ratio(gear) * transmission_scale


def gear_candidate(rpm: float, speed_kmh: float, transmission_scale: float) -> tuple[int, float]:
    candidates = (
        (gear, abs(rpm / expected_rpm(speed_kmh, gear, transmission_scale) - 1.0))
        for gear in GEAR_RATIOS
    )
    return min(candidates, key=lambda item: item[1])


def eligible_gear_sample(rpm: float | None, speed_kmh: float | None) -> bool:
    return (
        rpm is not None
        and speed_kmh is not None
        and rpm >= MIN_GEAR_RPM
        and speed_kmh >= MIN_GEAR_SPEED_KMH
    )


def calibrate_transmission_scale(samples: Sequence[tuple[float | None, float | None]]) -> float | None:
    """Fit the wheel-circumference scale against all supplied gear ratios.

    Every feasible sample/gear pairing contributes a scale candidate. The
    selected candidate minimizes clipped relative error across the entire ride,
    so one long steady gear cannot dictate an arbitrary gear-number offset.
    """
    observations = [rpm / speed for rpm, speed in samples if eligible_gear_sample(rpm, speed)]
    if len(observations) < MIN_CALIBRATION_SAMPLES:
        return None

    candidates = [
        observed_ratio / drive_ratio(gear)
        for observed_ratio in observations
        for gear in GEAR_RATIOS
        if CALIBRATION_SCALE_MIN <= observed_ratio / drive_ratio(gear) <= CALIBRATION_SCALE_MAX
    ]
    if not candidates:
        return None

    def score(scale: float) -> tuple[float, float]:
        errors = [gear_candidate(rpm, speed, scale)[1] for rpm, speed in samples if eligible_gear_sample(rpm, speed)]
        return statistics.mean(min(error, 0.20) for error in errors), statistics.median(errors)

    scale = min(candidates, key=score)
    errors = [gear_candidate(rpm, speed, scale)[1] for rpm, speed in samples if eligible_gear_sample(rpm, speed)]
    confidence = sum(error <= MAX_GEAR_RELATIVE_ERROR for error in errors) / len(errors)
    return scale if confidence >= MIN_CALIBRATION_CONFIDENCE else None


def supports_shift(
    current_gear: int,
    candidate_gear: int,
    previous_rpm: float | None,
    previous_ratio: float | None,
    rpm: float,
    observed_ratio: float,
) -> bool:
    """Require RPM/ratio evolution in the direction of an adjacent shift."""
    if abs(candidate_gear - current_gear) != 1:
        return False
    if candidate_gear > current_gear:  # Upshift: the drivetrain ratio drops.
        return (
            previous_rpm is None
            or rpm <= previous_rpm * 1.05
            or previous_ratio is not None and observed_ratio <= previous_ratio * 0.93
        )
    # Downshift: the drivetrain ratio rises.
    return (
        previous_rpm is None
        or rpm >= previous_rpm * 0.95
        or previous_ratio is not None and observed_ratio >= previous_ratio * 1.07
    )


def estimate_gears(
    samples: Sequence[tuple[float | None, float | None]],
    transmission_scale: float | None = None,
) -> tuple[list[int | None], GearAnalysis]:
    """Estimate gears with calibration, adjacent-shift state, and hysteresis.

    A sample is emitted only when its RPM/speed pair agrees with a theoretical
    gear within the confidence threshold. One consistent sample confirms the
    initial state; two consecutive supported samples confirm every transition.
    """
    ratios = [rpm / speed for rpm, speed in samples if eligible_gear_sample(rpm, speed)]
    bins = Counter(round(ratio / 5.0) * 5.0 for ratio in ratios)
    clusters = tuple(sorted(bins.items(), key=lambda item: (-item[1], item[0])))
    scale = transmission_scale if transmission_scale is not None else calibrate_transmission_scale(samples)
    if scale is None:
        return [None] * len(samples), GearAnalysis(
            None,
            len(ratios),
            clusters,
            False,
            "insufficient consistent RPM/speed evidence for drivetrain calibration",
        )

    estimated: list[int | None] = []
    current_gear: int | None = None
    pending_gear: int | None = None
    pending_count = 0
    previous_rpm: float | None = None
    previous_ratio: float | None = None

    for rpm, speed in samples:
        if not eligible_gear_sample(rpm, speed):
            estimated.append(None)
            pending_gear = None
            pending_count = 0
            continue

        assert rpm is not None and speed is not None
        observed_ratio = rpm / speed
        candidate, error = gear_candidate(rpm, speed, scale)
        if error > MAX_GEAR_RELATIVE_ERROR:
            estimated.append(None)
            pending_gear = None
            pending_count = 0
            previous_rpm = rpm
            previous_ratio = observed_ratio
            continue

        if current_gear is None:
            if pending_gear == candidate:
                pending_count += 1
            else:
                pending_gear, pending_count = candidate, 1
            if pending_count >= 2:
                current_gear = candidate
                pending_gear, pending_count = None, 0
                estimated.append(current_gear)
            else:
                estimated.append(None)
        elif candidate == current_gear:
            pending_gear, pending_count = None, 0
            estimated.append(current_gear)
        elif supports_shift(current_gear, candidate, previous_rpm, previous_ratio, rpm, observed_ratio):
            if pending_gear == candidate:
                pending_count += 1
            else:
                pending_gear, pending_count = candidate, 1
            if pending_count >= 2:
                current_gear = candidate
                pending_gear, pending_count = None, 0
                estimated.append(current_gear)
            else:
                estimated.append(None)
        else:
            estimated.append(None)
            pending_gear, pending_count = None, 0

        previous_rpm = rpm
        previous_ratio = observed_ratio

    inferred_samples = sum(gear is not None for gear in estimated)
    return estimated, GearAnalysis(
        None,
        len(ratios),
        clusters,
        inferred_samples > 0,
        "stateful estimate from supplied transmission ratios",
        scale,
        inferred_samples,
    )


def optional_float(value: str) -> float | None:
    value = value.strip()
    if value in MISSING_VALUES:
        return None
    try:
        parsed = float(value)
    except ValueError:
        return None
    return parsed if math.isfinite(parsed) else None


def classify_columns(headers: list[str]) -> tuple[tuple[str, ...], tuple[str, ...], tuple[str, ...]]:
    mapped = tuple(REQUIRED_HEADERS)
    known_acceleration = {
        "Gravity X(G)",
        "Gravity Y(G)",
        "Gravity Z(G)",
        "G(x)",
        "G(y)",
        "G(z)",
        "G(calibrated)",
    }
    unsupported = tuple(sorted(header for header in headers if header in SAFE_ACCELERATION_HEADERS))
    ignored = tuple(
        header
        for header in headers
        if header not in REQUIRED_HEADERS and header not in known_acceleration and header not in unsupported
    )
    ignored += tuple(header for header in headers if header in known_acceleration)
    return mapped, tuple(sorted(ignored)), unsupported


def convert(input_path: Path, output_path: Path) -> ConversionSummary:
    headers, raw_rows = read_source(input_path)
    validate_headers(headers)
    index = {header: position for position, header in enumerate(headers)}
    rows = [{header: row[position] for header, position in index.items()} for row in raw_rows]
    gear_samples = [
        (optional_float(row["Engine RPM(rpm)"]), optional_float(row["GPS Speed(km/h)"]))
        for row in rows
    ]
    estimated_gears, gear = estimate_gears(gear_samples)
    mapped, ignored, unsupported = classify_columns(headers)

    first_time: datetime | None = None
    previous_time: datetime | None = None
    previous_distance: float | None = None
    output_rows: list[list[str]] = []
    for row_index, (row_number, row) in enumerate(enumerate(rows, start=2)):
        device_time = parse_device_time(row["Device Time"], row_number)
        if previous_time is not None and device_time <= previous_time:
            raise ConversionError(f"row {row_number} Device Time must increase strictly")
        first_time = first_time or device_time
        previous_time = device_time

        latitude = require_range(parse_optional_number(row["Latitude"], "Latitude", row_number), "Latitude", row_number, -90.0, 90.0)
        longitude = require_range(parse_optional_number(row["Longitude"], "Longitude", row_number), "Longitude", row_number, -180.0, 180.0)
        speed = require_range(parse_optional_number(row["GPS Speed(km/h)"], "GPS Speed(km/h)", row_number), "GPS Speed(km/h)", row_number, 0.0, math.inf)
        altitude = parse_optional_number(row["GPS Altitude(m)"], "GPS Altitude(m)", row_number)
        rpm = require_range(parse_optional_number(row["Engine RPM(rpm)"], "Engine RPM(rpm)", row_number), "Engine RPM(rpm)", row_number, 0.0, math.inf)
        throttle = require_range(parse_optional_number(row["Throttle Position(Manifold)(%)"], "Throttle Position(Manifold)(%)", row_number), "Throttle Position(Manifold)(%)", row_number, 0.0, 100.0)
        torque_ft_lb = parse_optional_number(row["Torque(ft-lb)"], "Torque(ft-lb)", row_number)
        distance = require_range(parse_optional_number(row["Trip Distance(km)"], "Trip Distance(km)", row_number), "Trip Distance(km)", row_number, 0.0, math.inf)
        if distance is not None and previous_distance is not None and distance < previous_distance:
            raise ConversionError(f"row {row_number} Trip Distance(km) must be non-decreasing")
        if distance is not None:
            previous_distance = distance

        elapsed_seconds = (device_time - first_time).total_seconds()
        output_rows.append(
            [
                format_number(elapsed_seconds),
                format_number(latitude),
                format_number(longitude),
                format_number(speed),
                format_number(altitude),
                format_number(rpm),
                format_number(throttle),
                format_number(None if torque_ft_lb is None else torque_ft_lb * FT_LB_TO_NM),
                format_number(distance),
                "" if estimated_gears[row_index] is None else str(estimated_gears[row_index]),
            ]
        )

    if output_path.resolve() == input_path.resolve():
        raise ConversionError("Refusing to overwrite the input CSV")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.writer(destination)
        writer.writerow(OUTPUT_COLUMNS)
        writer.writerows(output_rows)

    return ConversionSummary(len(raw_rows), len(output_rows), mapped, ignored, unsupported, gear)


def print_summary(summary: ConversionSummary, input_path: Path, output_path: Path) -> None:
    print(f"Converted {summary.input_rows} rows: {input_path} -> {output_path}")
    print("Mapped source columns: " + ", ".join(summary.mapped_columns))
    print("Ignored source columns: " + ", ".join(summary.ignored_columns))
    print("Unsupported source columns: " + (", ".join(summary.unsupported_columns) or "none"))
    print("Acceleration/G-force: no source field is mapped; Gravity X/Y/Z are orientation gravity, not vehicle acceleration.")
    scale = "unavailable" if summary.gear.transmission_scale is None else format(summary.gear.transmission_scale, ".6g")
    print(
        "Gear: "
        + summary.gear.reason
        + f"; {summary.gear.inferred_samples}/{summary.output_rows} samples emitted; scale={scale}."
    )
    if summary.gear.clusters:
        clusters = ", ".join(f"~{ratio:g} RPM/(km/h): {count}" for ratio, count in summary.gear.clusters[:8])
        print(f"Gear ratio evidence ({summary.gear.eligible_samples} eligible samples): {clusters}")


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        summary = convert(args.input, args.output)
    except ConversionError as error:
        print(f"conversion failed: {error}", file=sys.stderr)
        return 2
    print_summary(summary, args.input, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

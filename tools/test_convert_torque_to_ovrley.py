"""Regression tests for the standalone Torque conversion tool."""

from __future__ import annotations

import csv
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools" / "convert_torque_to_ovrley.py"
FIXTURE = ROOT / "_samples" / "torque" / "trackLog-torque.csv"
SPEC = importlib.util.spec_from_file_location("convert_torque_to_ovrley", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
converter = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = converter
SPEC.loader.exec_module(converter)


class TorqueConversionTests(unittest.TestCase):
    SCALE = 8.51343

    @classmethod
    def sample(cls, gear: int, speed_kmh: float = 60.0, noise: float = 0.0) -> tuple[float, float]:
        return converter.expected_rpm(speed_kmh, gear, cls.SCALE) * (1.0 + noise), speed_kmh

    def estimate(self, samples: list[tuple[float | None, float | None]]) -> list[int | None]:
        gears, _ = converter.estimate_gears(samples, transmission_scale=self.SCALE)
        return gears

    def test_real_fixture_maps_generic_ovrley_columns_with_confidence_gated_gears(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "converted.csv"
            summary = converter.convert(FIXTURE, output)
            with output.open(newline="", encoding="utf-8") as file:
                reader = csv.DictReader(file)
                self.assertEqual(reader.fieldnames, list(converter.OUTPUT_COLUMNS))
                rows = list(reader)

        self.assertEqual(summary.input_rows, 754)
        self.assertEqual(summary.output_rows, 754)
        self.assertTrue(summary.gear.inferable)
        self.assertGreater(summary.gear.inferred_samples, 500)
        self.assertIsNotNone(summary.gear.transmission_scale)
        self.assertEqual(rows[0]["Elapsed Time (s)"], "0")
        self.assertEqual(rows[0]["Engine RPM (rpm)"], "")
        self.assertEqual(rows[0]["Torque (Nm)"], "")
        self.assertGreater(sum(row["Gear"] != "" for row in rows), 500)
        self.assertTrue(any(row["Torque (Nm)"] for row in rows))

    def test_real_fixture_converts_ft_lb_without_replacing_missing_values(self) -> None:
        with FIXTURE.open(newline="", encoding="utf-8") as file:
            source_rows = list(csv.DictReader(file, skipinitialspace=True))
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "converted.csv"
            converter.convert(FIXTURE, output)
            with output.open(newline="", encoding="utf-8") as file:
                converted_rows = list(csv.DictReader(file))

        index = next(index for index, row in enumerate(source_rows) if row["Torque(ft-lb)"].strip() not in ("", "-"))
        expected = float(source_rows[index]["Torque(ft-lb)"]) * converter.FT_LB_TO_NM
        self.assertAlmostEqual(float(converted_rows[index]["Torque (Nm)"]), expected, places=8)
        self.assertEqual(converted_rows[0]["Torque (Nm)"], "")

    def test_rejects_unsupported_gps_speed_unit(self) -> None:
        with FIXTURE.open(encoding="utf-8") as file:
            content = file.read().replace("GPS Speed(km/h)", "GPS Speed(mph)", 1)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "unsupported.csv"
            output = Path(directory) / "converted.csv"
            source.write_text(content, encoding="utf-8")
            with self.assertRaisesRegex(converter.ConversionError, "GPS Speed"):
                converter.convert(source, output)

    def test_steady_gear_requires_confirmation_then_remains_stable(self) -> None:
        self.assertEqual(self.estimate([self.sample(4) for _ in range(4)]), [None, 4, 4, 4])

    def test_each_adjacent_upshift_requires_hysteresis_confirmation(self) -> None:
        for lower_gear in range(1, 6):
            with self.subTest(shift=f"{lower_gear}->{lower_gear + 1}"):
                samples = [self.sample(lower_gear)] * 3 + [self.sample(lower_gear + 1)] * 3
                self.assertEqual(
                    self.estimate(samples),
                    [None, lower_gear, lower_gear, None, lower_gear + 1, lower_gear + 1],
                )

    def test_each_adjacent_downshift_requires_hysteresis_confirmation(self) -> None:
        for higher_gear in range(6, 1, -1):
            with self.subTest(shift=f"{higher_gear}->{higher_gear - 1}"):
                samples = [self.sample(higher_gear)] * 3 + [self.sample(higher_gear - 1)] * 3
                self.assertEqual(
                    self.estimate(samples),
                    [None, higher_gear, higher_gear, None, higher_gear - 1, higher_gear - 1],
                )

    def test_clutch_slip_and_low_speed_are_blank(self) -> None:
        steady = self.sample(4)
        slipping_rpm, slipping_speed = steady
        samples = [steady, steady, steady, (slipping_rpm * 1.45, slipping_speed), steady]
        self.assertEqual(self.estimate(samples), [None, 4, 4, None, 4])
        self.assertEqual(self.estimate([self.sample(4, speed_kmh=10.0)]), [None])

    def test_noisy_samples_remain_in_the_current_gear(self) -> None:
        samples = [self.sample(5, noise=noise) for noise in (0.0, 0.04, -0.05, 0.03)]
        self.assertEqual(self.estimate(samples), [None, 5, 5, 5])

    def test_temporary_missing_rpm_or_speed_is_blank_without_resetting_state(self) -> None:
        steady = self.sample(6)
        self.assertEqual(
            self.estimate([steady, steady, (None, steady[1]), (steady[0], None), steady]),
            [None, 6, None, None, 6],
        )


if __name__ == "__main__":
    unittest.main()

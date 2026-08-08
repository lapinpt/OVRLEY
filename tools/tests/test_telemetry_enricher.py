import csv
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from telemetry_enricher import normalize_throttle


class NormalizeThrottleTests(unittest.TestCase):
    def test_normalizes_profile_range_and_clamps(self):
        self.assertEqual(normalize_throttle(8), 0.0)
        self.assertEqual(normalize_throttle(50), 50.0)
        self.assertEqual(normalize_throttle(92), 100.0)
        self.assertEqual(normalize_throttle(0), 0.0)
        self.assertEqual(normalize_throttle(100), 100.0)

    def test_preserves_missing_throttle(self):
        self.assertIsNone(normalize_throttle(None))

    def test_enriched_output_adjusts_source_throttle_and_removes_legacy_column(self):
        source = (
            "Time (s),RPM,Speed (km/h),Absolute Load (%),Throttle position (%),Normalized Throttle (%)\n"
            "0,1500,0,50,8,0\n"
            "1,1500,0,50,50,50\n"
            "2,1500,0,50,92,100\n"
            "3,1500,0,50,,\n"
        )
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "input.csv"
            output_path = Path(directory) / "output.csv"
            input_path.write_text(source, encoding="utf-8")
            subprocess.run(
                [sys.executable, str(Path(__file__).resolve().parents[1] / "telemetry_enricher.py"), str(input_path), "--output", str(output_path)],
                check=True,
            )
            with output_path.open(newline="", encoding="utf-8") as output:
                reader = csv.DictReader(output)
                rows = list(reader)
                self.assertNotIn("Normalized Throttle (%)", reader.fieldnames)
            self.assertEqual([row["Throttle position (%)"] for row in rows], ["0.000000", "50.000000", "100.000000", ""])


if __name__ == "__main__":
    unittest.main()

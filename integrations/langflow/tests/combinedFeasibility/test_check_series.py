import unittest
from pathlib import Path

from checkSeries import apply_patch


class PatchInsertionTests(unittest.TestCase):
    def test_zero_context_insertions(self):
        cases = [
            (0, b"inserted\nfirst\nsecond\n"),
            (1, b"first\ninserted\nsecond\n"),
            (2, b"first\nsecond\ninserted\n"),
        ]
        for old_line, expected in cases:
            with self.subTest(old_line=old_line):
                files = {"sample.txt": b"first\nsecond\n"}
                patch = (
                    "diff --git a/sample.txt b/sample.txt\n"
                    "--- a/sample.txt\n"
                    "+++ b/sample.txt\n"
                    f"@@ -{old_line},0 +{old_line + 1} @@\n"
                    "+inserted\n"
                )
                apply_patch(files, patch, ".", Path("unused"), "unused")
                self.assertEqual(files["sample.txt"], expected)

    def test_insertion_offset_preserves_later_hunks(self):
        files = {"sample.txt": b"first\nsecond\nthird\n"}
        patch = (
            "diff --git a/sample.txt b/sample.txt\n"
            "--- a/sample.txt\n"
            "+++ b/sample.txt\n"
            "@@ -1,0 +2 @@\n"
            "+inserted\n"
            "@@ -2 +3 @@\n"
            "-second\n"
            "+changed\n"
            "@@ -3,0 +5 @@\n"
            "+last\n"
        )
        apply_patch(files, patch, ".", Path("unused"), "unused")
        self.assertEqual(files["sample.txt"], b"first\ninserted\nchanged\nthird\nlast\n")


if __name__ == "__main__":
    unittest.main()

import subprocess
import tempfile
import unittest
from pathlib import Path

from assertPinnedImports import digest, patch_paths, verify_overlay


class PinnedOverlayManifestTest(unittest.TestCase):
	def test_includes_tracked_and_untracked_patch_paths_with_modes(self) -> None:
		with tempfile.TemporaryDirectory(prefix="trellis-langflow-overlay-") as directory:
			root = Path(directory)
			repository = root / "source"
			subprocess.run(["git", "init", "--quiet", str(repository)], check=True)
			subprocess.run(["git", "-C", str(repository), "config", "user.email", "probe@trellis.local"], check=True)
			subprocess.run(["git", "-C", str(repository), "config", "user.name", "Trellis Probe"], check=True)

			package = repository / "package"
			package.mkdir()
			tracked = package / "__init__.py"
			tracked.write_text('value = "base"\n')
			(repository / "uv.lock").write_text("lock\n")
			subprocess.run(["git", "-C", str(repository), "add", "package/__init__.py", "uv.lock"], check=True)
			subprocess.run(["git", "-C", str(repository), "commit", "--quiet", "-m", "fixture"], check=True)

			patch = root / "overlay.patch"
			patch.write_text(
				"""diff --git a/package/__init__.py b/package/__init__.py
--- a/package/__init__.py
+++ b/package/__init__.py
@@ -1 +1 @@
-value = "base"
+value = "patched"
diff --git a/added.py b/added.py
new file mode 100755
--- /dev/null
+++ b/added.py
@@ -0,0 +1 @@
+value = "added"
"""
			)
			subprocess.run(["git", "-C", str(repository), "apply", str(patch)], check=True)

			self.assertEqual(patch_paths(repository, patch), ["added.py", "package/__init__.py"])
			status_sha256, manifest = verify_overlay(repository, patch)
			self.assertEqual(
				manifest,
				[
					{
						"exists": True,
						"mode": "0755",
						"path": "added.py",
						"sha256": digest(b'value = "added"\n'),
						"status": "??",
					},
					{
						"exists": True,
						"mode": "0644",
						"path": "package/__init__.py",
						"sha256": digest(b'value = "patched"\n'),
						"status": " M",
					},
				],
			)
			self.assertEqual(len(status_sha256), 64)

	def test_rejects_a_path_outside_the_patch(self) -> None:
		with tempfile.TemporaryDirectory(prefix="trellis-langflow-overlay-") as directory:
			root = Path(directory)
			repository = root / "source"
			subprocess.run(["git", "init", "--quiet", str(repository)], check=True)
			subprocess.run(["git", "-C", str(repository), "config", "user.email", "probe@trellis.local"], check=True)
			subprocess.run(["git", "-C", str(repository), "config", "user.name", "Trellis Probe"], check=True)
			tracked = repository / "tracked.py"
			tracked.write_text('value = "base"\n')
			subprocess.run(["git", "-C", str(repository), "add", "tracked.py"], check=True)
			subprocess.run(["git", "-C", str(repository), "commit", "--quiet", "-m", "fixture"], check=True)
			tracked.write_text('value = "patched"\n')
			patch = root / "overlay.patch"
			patch.write_bytes(
				subprocess.run(
					["git", "-C", str(repository), "diff", "--binary", "HEAD"],
					check=True,
					capture_output=True,
				).stdout
			)
			(repository / "unrelated.py").write_text("unrelated = True\n")

			with self.assertRaises(AssertionError):
				verify_overlay(repository, patch)

	def test_rejects_a_symlink_from_the_patch(self) -> None:
		with tempfile.TemporaryDirectory(prefix="trellis-langflow-overlay-") as directory:
			root = Path(directory)
			repository = root / "source"
			subprocess.run(["git", "init", "--quiet", str(repository)], check=True)
			subprocess.run(["git", "-C", str(repository), "config", "user.email", "probe@trellis.local"], check=True)
			subprocess.run(["git", "-C", str(repository), "config", "user.name", "Trellis Probe"], check=True)
			(repository / "tracked.py").write_text('value = "base"\n')
			subprocess.run(["git", "-C", str(repository), "add", "tracked.py"], check=True)
			subprocess.run(["git", "-C", str(repository), "commit", "--quiet", "-m", "fixture"], check=True)
			patch = root / "overlay.patch"
			patch.write_text(
				"""diff --git a/escape b/escape
new file mode 120000
--- /dev/null
+++ b/escape
@@ -0,0 +1 @@
+../outside
\\ No newline at end of file
"""
			)
			subprocess.run(["git", "-C", str(repository), "apply", str(patch)], check=True)

			with self.assertRaises(AssertionError):
				verify_overlay(repository, patch)


if __name__ == "__main__":
	unittest.main()

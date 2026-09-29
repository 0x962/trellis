import argparse
from pathlib import Path

from . import export_frontend_templates


def main():
	parser = argparse.ArgumentParser()
	parser.add_argument("--trellis-root", type=Path, required=True)
	parser.add_argument("--engine-root", type=Path, required=True)
	parser.add_argument("--manifest-sha256", required=True)
	parser.add_argument("--engine-commit", required=True)
	parser.add_argument("--engine-overlay-sha256", required=True)
	parser.add_argument("--output", type=Path, required=True)
	args = parser.parse_args()
	output = args.output.parent.resolve(strict=True) / args.output.name
	if any(output.is_relative_to(root.resolve()) for root in (args.trellis_root, args.engine_root)):
		raise ValueError("catalog_export_inside_source_root")
	content = export_frontend_templates(
		args.trellis_root, args.engine_root, args.manifest_sha256, engine_commit=args.engine_commit,
		engine_overlay_sha256=args.engine_overlay_sha256,
	)
	with output.open("xb") as stream:
		stream.write(content)


if __name__ == "__main__":
	main()

import { createHash } from "node:crypto";
import type { LaunchSpec } from "@trellis/runtime-protocol";

export function fingerprintLaunch(spec: LaunchSpec): string {
	return createHash("sha256")
		.update(
			JSON.stringify([
				spec.command,
				spec.args,
				spec.cwd,
				spec.mode,
				Object.entries(spec.env ?? {}).sort(),
				spec.cols ?? 80,
				spec.rows ?? 24,
				spec.separateStderr ?? false,
				spec.timeoutMs ?? null,
			]),
		)
		.digest("hex");
}

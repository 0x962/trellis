import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessLaunch, HarnessLaunchInput } from "../types.ts";

export async function prepareCodex(input: HarnessLaunchInput): Promise<HarnessLaunch> {
	const bridge =
		input.env?.TRELLIS_CODEX_BRIDGE ?? fileURLToPath(new URL("../../../../dist/codex-bridge.js", import.meta.url));
	const directory = join("/tmp", `trl-codex-${randomUUID()}`);
	const launchPath = join(input.configDirectory, "codex-launch.json");
	await writeFile(
		launchPath,
		JSON.stringify({
			cwd: input.cwd,
			prompt: input.prompt,
			model: input.model,
			effort: input.effort,
			...(input.resume ? { sessionId: input.sessionId } : {}),
		}),
		{ mode: 0o600 },
	);
	return {
		executable: input.env?.TRELLIS_RUNTIME_NODE ?? "node",
		args: [bridge, launchPath],
		env: {
			TRELLIS_CODEX_ENGINE_SOCKET: join(directory, "engine.sock"),
			TRELLIS_CODEX_CONTROL_SOCKET: join(directory, "control.sock"),
			TRELLIS_CODEX_CONTROL_TOKEN: randomUUID(),
		},
	};
}

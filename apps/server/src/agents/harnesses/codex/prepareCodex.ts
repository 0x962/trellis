import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessLaunch, HarnessLaunchInput } from "../types.ts";

export async function prepareCodex(input: HarnessLaunchInput): Promise<HarnessLaunch> {
	if (input.managerTools)
		throw new Error(
			"Codex cannot enforce the manager tool boundary. Select Claude, OpenCode, or Pi for managers. Codex workers remain available.",
		);
	const bridge =
		input.env?.TRELLIS_CODEX_BRIDGE ?? fileURLToPath(new URL("../../../../dist/codex-bridge.js", import.meta.url));
	const directory = join("/tmp", `trl-codex-${randomUUID()}`);
	return {
		executable: input.env?.TRELLIS_RUNTIME_NODE ?? "node",
		args: [
			bridge,
			JSON.stringify({
				cwd: input.cwd,
				prompt: input.prompt,
				model: input.model,
				...(input.resume ? { sessionId: input.sessionId } : {}),
			}),
		],
		env: {
			TRELLIS_CODEX_ENGINE_SOCKET: join(directory, "engine.sock"),
			TRELLIS_CODEX_CONTROL_SOCKET: join(directory, "control.sock"),
			TRELLIS_CODEX_CONTROL_TOKEN: randomUUID(),
		},
	};
}

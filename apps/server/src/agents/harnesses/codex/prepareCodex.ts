import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessLaunch, HarnessLaunchInput } from "../types.ts";

export async function prepareCodex(input: HarnessLaunchInput): Promise<HarnessLaunch> {
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
				effort: input.effort,
				...(input.managerTools ? { managerSystemPrompt: input.managerSystemPrompt } : {}),
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

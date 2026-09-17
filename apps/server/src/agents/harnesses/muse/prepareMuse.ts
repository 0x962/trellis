import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessLaunch, HarnessLaunchInput } from "../types.ts";

// Muse reads `AGENTS.md` of a trusted workspace as its project rules. A
// manager works in a private empty workspace, so that file holds the
// manager instruction and nothing else. Muse keeps its own
// base instructions in front of it.
export const MUSE_MANAGER_RULES_FILE = "AGENTS.md";

export async function prepareMuse(input: HarnessLaunchInput): Promise<HarnessLaunch> {
	const bridge =
		input.env?.TRELLIS_MUSE_BRIDGE ?? fileURLToPath(new URL("../../../../dist/muse-bridge.js", import.meta.url));
	const directory = join("/tmp", `trl-muse-${randomUUID()}`);
	if (input.managerTools) await writeFile(join(input.cwd, MUSE_MANAGER_RULES_FILE), input.managerSystemPrompt);
	return {
		executable: input.env?.TRELLIS_RUNTIME_NODE ?? "node",
		args: [
			bridge,
			JSON.stringify({
				cwd: input.cwd,
				prompt: input.prompt,
				model: input.model,
				...(input.managerTools ? { managerTools: input.managerTools } : {}),
				...(input.resume ? { sessionId: input.sessionId } : {}),
			}),
		],
		env: {
			TRELLIS_MUSE_CONTROL_SOCKET: join(directory, "control.sock"),
			TRELLIS_MUSE_CONTROL_TOKEN: randomUUID(),
			// The launcher of Muse replaces its binary in the background on a
			// schedule. A replacement during an agent run breaks the next
			// launch, so a Trellis run never triggers one.
			MUSE_NO_AUTO_UPDATE: "1",
		},
	};
}

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessLaunch, HarnessLaunchInput } from "../types.ts";

export async function prepareMuse(input: HarnessLaunchInput): Promise<HarnessLaunch> {
	const bridge =
		input.env?.TRELLIS_MUSE_BRIDGE ?? fileURLToPath(new URL("../../../../dist/muse-bridge.js", import.meta.url));
	const directory = join("/tmp", `trl-muse-${randomUUID()}`);
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
			TRELLIS_MUSE_CONTROL_SOCKET: join(directory, "control.sock"),
			TRELLIS_MUSE_CONTROL_TOKEN: randomUUID(),
			// The launcher of Muse replaces its binary in the background on a
			// schedule. A replacement during an agent run breaks the next
			// launch, so a Trellis run never triggers one.
			MUSE_NO_AUTO_UPDATE: "1",
		},
	};
}

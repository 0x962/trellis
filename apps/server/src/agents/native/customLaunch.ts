import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LaunchSpec } from "@trellis/runtime-protocol";

export const customLaunch = async (
	home: string,
	spec: Omit<LaunchSpec, "command" | "args" | "mode"> & { command: string },
): Promise<LaunchSpec> => {
	const launch: LaunchSpec = {
		...spec,
		command: "/bin/zsh",
		args: ["-f", "-c", spec.command],
		mode: "pty",
		cols: 120,
		rows: 32,
	};
	const directory = join(home, "harness-attempts", spec.id);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	await writeFile(join(directory, "launch.json"), JSON.stringify({ harness: "custom", spec: launch }), {
		flag: "wx",
		mode: 0o600,
	});
	return launch;
};

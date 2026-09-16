import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import type { PinnedRelease } from "../pinnedResources/pinnedResources.ts";

const execute = promisify(execFile);
const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw error;
	}
};

export const stopReleaseRuntime = async (home: string, release: PinnedRelease) => {
	const manifest = join(home, "runtime/manifest.json");
	if (!existsSync(manifest)) {
		if (existsSync(join(home, "runtime/runtime.sock"))) throw new Error("The execution service has no owner record.");
		return;
	}
	const { pid, version } = JSON.parse(await readFile(manifest, "utf8"));
	if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(version) || version <= 0)
		throw new Error("The execution service owner record is invalid.");
	if (!alive(pid)) return;
	if (version !== release.manifest.protocol)
		throw new Error("The active host cannot stop this execution service protocol. Inspect the local runtime log.");
	const client = join(release.root, "packages/runtime-protocol/src/client.ts");
	const socket = join(home, "runtime/runtime.sock");
	await execute(
		join(release.root, "bin/bun"),
		[
			"--eval",
			`const { RuntimeClient } = await import(${JSON.stringify(client)}); await new RuntimeClient(${JSON.stringify(socket)}).shutdown();`,
		],
		{ timeout: 60000 },
	);
	const deadline = Date.now() + 10000;
	while (Date.now() < deadline) {
		if (!alive(pid)) return;
		await setTimeout(100);
	}
	throw new Error("The execution service still runs. Inspect the local runtime log before you activate the package.");
};

import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { LaunchSpec } from "@trellis/runtime-protocol";
import { createProcessHandle } from "../../processHandle.ts";

// The agent of these tests. It starts a child that starts a grandchild, and a
// process in a new OS session. Each process writes its PID to a file in the
// directory of $1. The agent waits for the file "go" and exits with code $2.
const treeScript = `#!/bin/sh
dir="$1"
sh -c 'sleep 300 & echo $! > "$1/grandchild.tmp"; mv "$1/grandchild.tmp" "$1/grandchild"; wait' sh "$dir" &
echo $! > "$dir/child.tmp"; mv "$dir/child.tmp" "$dir/child"
setsid sh -c 'echo $$ > "$1/escaped.tmp"; mv "$1/escaped.tmp" "$1/escaped"; exec sleep 300' sh "$dir" &
while [ ! -e "$dir/go" ]; do sleep 0.05; done
exit "\${2:-0}"
`;

export function writeTreeAgent(directory: string) {
	const path = join(directory, "tree.sh");
	writeFileSync(path, treeScript);
	chmodSync(path, 0o755);
	return path;
}

export const treeSpec = (directory: string, mode: LaunchSpec["mode"], exitCode = 0): LaunchSpec => ({
	id: `linux-lifecycle-${mode}-${Date.now()}`,
	command: join(directory, "tree.sh"),
	args: [directory, String(exitCode)],
	cwd: directory,
	mode,
});

export async function waitFor(condition: () => boolean, label: string, timeoutMs = 10_000) {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() >= deadline) throw new Error(`Timed out while waiting for ${label}`);
		await sleep(20);
	}
}

export async function treePids(directory: string) {
	for (const name of ["child", "grandchild", "escaped"])
		await waitFor(() => existsSync(join(directory, name)), `the ${name} PID file`);
	const read = (name: string) => Number(readFileSync(join(directory, name), "utf8").trim());
	return { child: read("child"), grandchild: read("grandchild"), escaped: read("escaped") };
}

export function launch(spec: LaunchSpec) {
	let finish: (code: number | null) => void = () => {};
	const exited = new Promise<number | null>((resolve) => {
		finish = resolve;
	});
	const failures: string[] = [];
	const handle = createProcessHandle(
		spec,
		() => {},
		() => {},
		(code) => finish(code),
		(error) => failures.push(`failed: ${error.message}`),
		(error) => failures.push(`unconfirmed: ${error.message}`),
		(error) => failures.push(`input: ${error.message}`),
	);
	return { handle, exited, failures };
}

// proc(5): the start time is field 22 of /proc/<pid>/stat.
export const startTicks = (pid: number) => {
	const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
	return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]!;
};

export const cgroupProcesses = (path: string) =>
	readFileSync(join(path, "cgroup.procs"), "utf8").split("\n").filter(Boolean).map(Number);

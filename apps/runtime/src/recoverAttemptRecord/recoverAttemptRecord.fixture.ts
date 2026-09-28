import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { inspectProcess } from "../inspectProcess.ts";
import { startRuntime } from "../server.ts";

const home = process.argv[2]!;
const runtimeHome = join(home, "runtime");
const children: ChildProcess[] = [];
let descendant: number | undefined;
let runtime = await startRuntime(runtimeHome);
const client = new RuntimeClient(runtime.hello.socketPath);
const waitFor = async (condition: () => boolean) => {
	const deadline = Date.now() + 5000;
	while (!condition()) {
		assert.ok(Date.now() < deadline, "process condition timed out");
		await setTimeout(20);
	}
};
const orphan = (id: string, code: string, command = process.execPath) => {
	const child = spawn(command, ["--input-type=module", "--eval", code], {
		detached: true,
		stdio: ["ignore", "ignore", "inherit"],
		env: { ...process.env, TRELLIS_ATTEMPT_ID: id, TRELLIS_RUNTIME_HOME: runtimeHome },
	});
	children.push(child);
	return child;
};
const sleeper = "setInterval(() => {}, 1000)";
try {
	const childFile = join(home, "child-pid");
	const parent = orphan(
		"lost",
		`import { spawn } from 'node:child_process';
		import { writeFileSync } from 'node:fs';
		const child = spawn(process.execPath, ['--eval', ${JSON.stringify(sleeper)}], { detached: true, stdio: 'ignore' });
		writeFileSync(${JSON.stringify(childFile)}, String(child.pid)); ${sleeper}`,
	);
	const unrelated = orphan("other", sleeper);
	await waitFor(() => existsSync(childFile));
	descendant = Number(readFileSync(childFile, "utf8"));
	const recovered = await Promise.all([client.recover("lost"), client.recover("lost")]);
	assert.ok(recovered.every((record) => record.status === "exited" && record.endedAt !== null));
	await waitFor(() => inspectProcess(parent.pid!).kind === "missing" && inspectProcess(descendant!).kind === "missing");
	assert.equal(inspectProcess(unrelated.pid!).kind, "live");
	await client.stop("other");
	assert.equal(inspectProcess(unrelated.pid!).kind, "missing");

	const executable = join(home, "unlinked-agent");
	execFileSync("cc", ["-x", "c", "-o", executable, "-"], { input: "#include <unistd.h>\nint main() { sleep(60); }\n" });
	const appDirectory = join(home, "Trellis.app/Contents/MacOS");
	mkdirSync(appDirectory, { recursive: true });
	const appExecutable = join(appDirectory, "Trellis");
	copyFileSync(executable, appExecutable);
	const desktop = orphan("unlinked", "", appExecutable);
	const unlinked = orphan("unlinked", "", executable);
	await waitFor(() => {
		const observed = inspectProcess(unlinked.pid!);
		return observed.kind === "live" && observed.process.executable.endsWith("/unlinked-agent");
	});
	unlinkSync(executable);
	assert.equal(inspectProcess(unlinked.pid!).kind, "unknown");
	assert.equal((await client.recover("unlinked")).status, "exited");
	assert.equal(inspectProcess(desktop.pid!).kind, "live");

	const flag = join(home, "duplicate");
	const delayed = await client.start({
		id: "lost",
		mode: "stdio",
		command: process.execPath,
		args: ["--eval", `require('node:fs').writeFileSync(${JSON.stringify(flag)}, 'duplicate')`],
		cwd: home,
	});
	assert.equal(delayed.status, "exited");
	assert.equal(existsSync(flag), false);

	const owned = await client.start({
		id: "owned",
		mode: "stdio",
		command: process.execPath,
		args: ["--eval", sleeper],
		cwd: home,
	});
	const stillOwned = await client.recover("owned");
	assert.equal(stillOwned.pid, owned.pid);
	assert.equal(stillOwned.controllable, true);
	assert.equal(stillOwned.status, "running");
	await client.stop("owned");
	await runtime.close();
	const legacy = orphan("legacy", sleeper);
	await waitFor(() => inspectProcess(legacy.pid!).kind === "live");
	const observed = inspectProcess(legacy.pid!);
	assert.equal(observed.kind, "live");
	if (observed.kind !== "live") throw new Error("legacy process missing");
	writeFileSync(
		join(runtimeHome, "sessions", "legacy.session.json"),
		JSON.stringify({
			session: {
				id: "legacy",
				daemonId: "old",
				pid: legacy.pid,
				mode: "stdio",
				status: "running",
				startedAt: new Date().toISOString(),
				endedAt: null,
				exitCode: null,
				error: null,
			},
			identity: observed.process.identity,
			fingerprint: null,
			launch: null,
		}),
	);
	runtime = await startRuntime(runtimeHome);
	assert.equal((await client.recover("legacy")).status, "exited");
	assert.equal(inspectProcess(legacy.pid!).kind, "missing");
	assert.equal((await client.recover("lost")).status, "exited");
	writeFileSync(join(home, "passed"), "orphan, detached child, isolation, duplicate, live owner, restart");
} finally {
	for (const child of children) child.kill("SIGKILL");
	if (descendant !== undefined && inspectProcess(descendant).kind === "live") process.kill(descendant, "SIGKILL");
	await runtime.close();
}

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stopAttemptProcesses } from "../../attemptProcesses";
import { ProcessExitWatcher } from "../../processExitWatcher.ts";
import type { SessionRecord } from "../../sessionRecord.ts";
import { stopProcessTree } from "../../stopProcessTree.ts";
import { watchRecoveredSession } from "../../watchRecoveredSession.ts";
import { platform } from "../index.ts";
import { homeTag } from "./cgroupPaths.ts";
import { linuxCgroupLifecycle } from "./index.ts";
import {
	attemptId,
	cgroupProcesses,
	exitOf,
	gone,
	launchCgroup,
	treePids,
	waitFor,
	writeOrphanAgent,
} from "./linuxProcessFixture.ts";

// The state that linuxLifecycleFixture.ts gives each recovery case.
export type RecoveryContext = {
	directory: (name: string) => string;
	cleanup: ChildProcess[];
	record: (name: string, details: Record<string, unknown>) => void;
};

// Runs `node fixture.js runtime-death <path>`: a runtime that launches an agent
// and dies. Answers the leader and the identity that the runtime recorded.
async function deadRuntime(context: RecoveryContext, path: string, ...args: string[]) {
	const runtime = spawn(process.execPath, [process.argv[1]!, "runtime-death", path, ...args], { stdio: "inherit" });
	context.cleanup.push(runtime);
	assert.deepEqual(await exitOf(runtime), [null, "SIGKILL"]);
	return JSON.parse(readFileSync(join(path, "runtime.json"), "utf8")) as { leader: number; identity: string };
}

// The runtime dies, then every process of the agent exits except one that
// started its own OS session. The stop by the attempt markers passes the
// session of that process, and the stop finds the launch cgroup from it.
export async function setsidSurvivor(context: RecoveryContext) {
	const path = context.directory("setsid-survivor");
	const recorded = await deadRuntime(context, path);
	const pids = await treePids(path);
	const cgroup = launchCgroup(pids.escaped);
	const others = [recorded.leader, pids.child, pids.grandchild];
	for (const pid of others) process.kill(pid, "SIGKILL");
	await waitFor(() => others.every(gone), "the exit of every process except the survivor");
	const survivorSession = platform.sessionOf(pids.escaped);
	assert.equal(survivorSession, pids.escaped);
	assert.ok(cgroupProcesses(cgroup).includes(pids.escaped));
	await stopAttemptProcesses(path, attemptId);
	assert.ok(gone(pids.escaped), `${pids.escaped} exited`);
	assert.equal(existsSync(cgroup), false);
	context.record("setsid-survivor", { leader: recorded.leader, ...pids, survivorSession, cgroup });
}

// Launches of a runtime of this home that died: one with a live leader, one
// with a dead leader and a process without attempt markers, and one empty
// cgroup. A launch of another runtime home has a live process. The new runtime
// adopts the first launch by identity and then sweeps once.
export async function adoptionAndSweep(context: RecoveryContext) {
	const launchRoot = linuxCgroupLifecycle.launchRoot();
	const adoptedPath = context.directory("adopted");
	const adopted = await deadRuntime(context, adoptedPath);
	const adoptedPids = await treePids(adoptedPath);
	const adoptedCgroup = launchCgroup(adopted.leader);

	const orphanPath = context.directory("orphan");
	writeOrphanAgent(orphanPath);
	const orphanLaunch = await deadRuntime(context, orphanPath, "orphan");
	const orphan = Number(readFileSync(join(orphanPath, "orphan"), "utf8"));
	const orphanCgroup = launchCgroup(orphan);
	writeFileSync(join(orphanPath, "go"), "");
	await waitFor(() => gone(orphanLaunch.leader), "the exit of the orphan leader");
	assert.ok(!readFileSync(`/proc/${orphan}/environ`, "utf8").includes("TRELLIS_ATTEMPT_ID="));
	assert.deepEqual(platform.attemptProcesses(orphanPath, attemptId), []);

	const leakedCgroup = join(launchRoot, `launch-leaked-${process.pid}`);
	mkdirSync(leakedCgroup);

	const otherHome = join(linuxCgroupLifecycle.attemptsRoot(), homeTag(`${adoptedPath}-other-home`));
	const otherCgroup = join(otherHome, "launch-other");
	mkdirSync(otherCgroup, { recursive: true });
	const other = spawn("sleep", ["300"]);
	context.cleanup.push(other);
	writeFileSync(join(otherCgroup, "cgroup.procs"), String(other.pid));

	const record = {
		session: { pid: adopted.leader, endedAt: null },
		identity: adopted.identity,
		watchedPids: new Set<number>(),
		listeners: new Set<() => void>(),
	} as unknown as SessionRecord;
	const exits = new ProcessExitWatcher();
	watchRecoveredSession(record, exits);
	assert.equal(linuxCgroupLifecycle.registeredCgroup(adopted.leader), adoptedCgroup);

	const swept = await linuxCgroupLifecycle.sweep();
	assert.deepEqual(
		swept.map((event) => [event.cgroup, event.outcome]).sort(),
		[
			[leakedCgroup, "removed"],
			[orphanCgroup, "removed"],
		].sort(),
	);
	assert.ok(swept.find((event) => event.cgroup === orphanCgroup)?.pids.includes(orphan));
	assert.ok(gone(orphan), `${orphan} exited`);
	assert.equal(existsSync(orphanCgroup), false);
	assert.equal(existsSync(leakedCgroup), false);
	assert.ok(existsSync(adoptedCgroup));
	for (const pid of [adopted.leader, ...Object.values(adoptedPids)]) assert.ok(!gone(pid), `${pid} still runs`);
	assert.ok(cgroupProcesses(otherCgroup).includes(other.pid!), "the launch of the other home still runs");

	other.kill("SIGKILL");
	await exitOf(other);
	await waitFor(() => cgroupProcesses(otherCgroup).length === 0, "an empty cgroup of the other home");
	rmdirSync(otherCgroup);
	rmdirSync(otherHome);

	// Only the process in its own OS session stays, so only the registry
	// leads the stop of the leader session to the adopted cgroup.
	const others = [adopted.leader, adoptedPids.child, adoptedPids.grandchild];
	for (const pid of others) process.kill(pid, "SIGKILL");
	await waitFor(() => others.every(gone), "the exit of the adopted leader session");
	// The agent loop can leave a short `sleep 0.05` in the leader session.
	await waitFor(() => platform.inspectProcessSession(adopted.leader).kind === "empty", "an empty leader session");
	await stopProcessTree(adopted.leader);
	assert.ok(gone(adoptedPids.escaped), `${adoptedPids.escaped} exited`);
	assert.equal(existsSync(adoptedCgroup), false);
	assert.equal(linuxCgroupLifecycle.registeredCgroup(adopted.leader), undefined);
	exits.close();
	context.record("adoption-and-sweep", {
		adopted: { ...adopted, ...adoptedPids, cgroup: adoptedCgroup },
		orphan,
		orphanCgroup,
		leakedCgroup,
		otherCgroup,
		swept,
	});
}

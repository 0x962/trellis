import assert from "node:assert/strict";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { arch, release, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { RuntimeSession } from "@trellis/runtime-protocol";
import { stopAttemptProcesses } from "../../attemptProcesses";
import { inspectProcess } from "../../inspectProcess.ts";
import { observedSession } from "../../observedSession.ts";
import { ProcessExitWatcher } from "../../processExitWatcher.ts";
import { processIdentity } from "../../processIdentity";
import { stopProcessTree } from "../../stopProcessTree.ts";
import { platform } from "../index.ts";
import { linuxCgroupDirectory } from "./cgroupLifecycle.ts";
import { linuxCgroupLifecycle } from "./index.ts";
import {
	cgroupProcesses,
	launch,
	startTicks,
	treePids,
	treeSpec,
	waitFor,
	writeTreeAgent,
} from "./linuxProcessFixture.ts";
import { createLinuxProcessInspector } from "./linuxProcessInspector.ts";

// Node runs this program. `linuxLifecycle.process.test.ts` bundles it.
// `node fixture.js cases <proof.json>` runs every real process case.
// `node fixture.js probe` exits 0 when this host can contain a launch.
// `node fixture.js refusal <proof.json>` expects a refused launch.
// `node fixture.js runtime-death <directory>` acts as a runtime that dies.
const [mode, target] = process.argv.slice(2) as [string, string];
const exitOf = (child: ChildProcess) =>
	new Promise<[number | null, string | null]>((resolve) =>
		child.once("exit", (code, signal) => resolve([code, signal])),
	);
const gone = (pid: number) => inspectProcess(pid).kind === "missing";
const launchCgroup = (pid: number) =>
	linuxCgroupDirectory(readFileSync(`/proc/${pid}/cgroup`, "utf8"), readFileSync("/proc/self/mountinfo", "utf8"));
const attemptId = "runtime-death";

if (mode === "runtime-death") {
	const { handle } = launch({
		...treeSpec(target, "stdio"),
		env: { TRELLIS_ATTEMPT_ID: attemptId, TRELLIS_RUNTIME_HOME: target },
	});
	await treePids(target);
	const leader = processIdentity(handle.pid);
	assert.equal(leader.kind, "live");
	if (leader.kind !== "live") throw new Error("unreachable");
	writeFileSync(
		join(target, "runtime.json"),
		JSON.stringify({ leader: handle.pid, identity: leader.process.identity }),
	);
	process.kill(process.pid, "SIGKILL");
}

if (mode === "probe") {
	linuxCgroupLifecycle.prepareLaunch({ id: "probe", command: "/bin/true", args: [], cwd: "/", mode: "stdio" });
}

if (mode === "refusal") {
	assert.throws(
		() => launch({ id: "refused", command: "/bin/true", args: [], cwd: "/", mode: "stdio" }),
		(error: Error) => {
			writeFileSync(target, JSON.stringify({ arch: arch(), kernel: release(), refusal: error.message }, null, 2));
			return error.message.startsWith("Linux agent launch requires a delegated cgroup v2 subtree: ");
		},
	);
}

if (mode === "cases") {
	const scratch = mkdtempSync(join(tmpdir(), "trellis-linux-lifecycle-"));
	const bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
	const attemptsRoot = linuxCgroupLifecycle.attemptsRoot();
	const cleanup: ChildProcess[] = [];
	const cases: { name: string; details: Record<string, unknown> }[] = [];
	const directory = (name: string) => {
		const path = mkdtempSync(join(scratch, `${name}-`));
		writeTreeAgent(path);
		return path;
	};
	const launchDirectories = () => readdirSync(attemptsRoot).filter((name) => name.startsWith("launch-"));
	const proof = (status: string, error?: string) =>
		writeFileSync(
			target,
			JSON.stringify(
				{ arch: arch(), kernel: release(), node: process.version, bootId, attemptsRoot, status, error, cases },
				null,
				2,
			),
		);

	const processTree = async () => {
		const path = directory("tree");
		const { handle, exited, failures } = launch(treeSpec(path, "stdio"));
		const pids = await treePids(path);
		const leader = handle.pid;
		const cgroup = launchCgroup(leader);
		assert.ok(cgroup.startsWith(`${attemptsRoot}/launch-`), cgroup);
		const members = cgroupProcesses(cgroup);
		for (const pid of [leader, pids.child, pids.grandchild, pids.escaped])
			assert.ok(members.includes(pid), `${pid} in ${cgroup}`);
		const observed = inspectProcess(leader);
		assert.equal(
			observed.kind === "live" && observed.process.identity,
			`linux:${bootId}:${leader}:${startTicks(leader)}`,
		);
		const escapedSession = platform.sessionOf(pids.escaped);
		assert.notEqual(escapedSession, leader);
		handle.stop();
		assert.equal(await exited, null);
		assert.deepEqual(failures, []);
		for (const pid of [leader, pids.child, pids.grandchild, pids.escaped]) assert.ok(gone(pid), `${pid} exited`);
		assert.equal(existsSync(cgroup), false);
		cases.push({ name: "process-tree", details: { leader, ...pids, escapedSession, members, cgroup } });
	};

	const parentDeath = async () => {
		const path = directory("parent-death");
		const { handle, exited, failures } = launch(treeSpec(path, "stdio", 3));
		const pids = await treePids(path);
		const cgroup = launchCgroup(handle.pid);
		process.kill(pids.child, "SIGKILL");
		await waitFor(() => {
			const after = inspectProcess(pids.grandchild);
			return after.kind === "live" && after.process.parentPid !== pids.child;
		}, "the reparent of the grandchild");
		const after = inspectProcess(pids.grandchild);
		assert.ok(cgroupProcesses(cgroup).includes(pids.grandchild));
		writeFileSync(join(path, "go"), "");
		assert.equal(await exited, 3);
		assert.deepEqual(failures, []);
		for (const pid of [handle.pid, pids.grandchild, pids.escaped]) assert.ok(gone(pid), `${pid} exited`);
		assert.equal(existsSync(cgroup), false);
		const parentAfter = after.kind === "live" ? after.process.parentPid : null;
		cases.push({ name: "parent-death", details: { leader: handle.pid, ...pids, parentAfter, exitCode: 3 } });
	};

	const runtimeDeath = async () => {
		const path = directory("runtime-death");
		const runtime = spawn(process.execPath, [process.argv[1]!, "runtime-death", path], { stdio: "inherit" });
		cleanup.push(runtime);
		assert.deepEqual(await exitOf(runtime), [null, "SIGKILL"]);
		const recorded = JSON.parse(readFileSync(join(path, "runtime.json"), "utf8")) as {
			leader: number;
			identity: string;
		};
		const pids = await treePids(path);
		const current = processIdentity(recorded.leader);
		assert.equal(current.kind === "live" && current.process.identity, recorded.identity);
		assert.notEqual(current.kind === "live" && current.process.parentPid, runtime.pid);
		const cgroup = launchCgroup(recorded.leader);
		await stopProcessTree(recorded.leader);
		for (const pid of [recorded.leader, pids.child, pids.grandchild, pids.escaped])
			assert.ok(gone(pid), `${pid} exited`);
		assert.equal(existsSync(cgroup), false);
		cases.push({ name: "runtime-death", details: { runtime: runtime.pid, ...recorded, ...pids, cgroup } });
	};

	// The runtime dies, then every process of the agent exits except one that
	// started its own OS session. The stop by the attempt markers passes the
	// session of that process, and the stop finds the launch cgroup from it.
	const setsidSurvivor = async () => {
		const path = directory("setsid-survivor");
		const runtime = spawn(process.execPath, [process.argv[1]!, "runtime-death", path], { stdio: "inherit" });
		cleanup.push(runtime);
		assert.deepEqual(await exitOf(runtime), [null, "SIGKILL"]);
		const recorded = JSON.parse(readFileSync(join(path, "runtime.json"), "utf8")) as { leader: number };
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
		cases.push({ name: "setsid-survivor", details: { leader: recorded.leader, ...pids, survivorSession, cgroup } });
	};

	const cancellation = async () => {
		const path = directory("cancel");
		const { handle, exited, failures } = launch(treeSpec(path, "pty"));
		handle.stop();
		const code = await exited;
		assert.deepEqual(failures, []);
		assert.ok(gone(handle.pid));
		assert.deepEqual(launchDirectories(), []);
		await sleep(200);
		const started = ["child", "grandchild", "escaped"].filter((name) => existsSync(join(path, name)));
		for (const name of started) assert.ok(gone(Number(readFileSync(join(path, name), "utf8"))), `${name} exited`);
		cases.push({ name: "cancellation", details: { leader: handle.pid, mode: "pty", code, started } });
	};

	const pidReuse = async () => {
		const first = spawn("sleep", ["300"]);
		cleanup.push(first);
		const pid = first.pid!;
		await waitFor(() => inspectProcess(pid).kind === "live", "the first process");
		const recorded = processIdentity(pid);
		if (recorded.kind !== "live") throw new Error("The first process must be live");
		// A controlled reader returns the stat of a later process with this PID.
		const later = readFileSync(`/proc/${pid}/stat`, "utf8").replace(
			/^(.*\) (?:\S+ ){19})(\d+)/,
			(_match, head: string, ticks: string) => `${head}${BigInt(ticks) + 1n}`,
		);
		const controlled = createLinuxProcessInspector({
			readFile: (path) => (path === `/proc/${pid}/stat` ? later : readFileSync(path, "utf8")),
			readLink: (path) => readlinkSync(path, "utf8"),
			readDirectory: () => [],
			clockTicks: 100,
		}).processIdentity(pid);
		assert.equal(controlled.kind, "live");
		assert.notEqual(controlled.kind === "live" && controlled.process.identity, recorded.process.identity);
		first.kill("SIGKILL");
		await exitOf(first);
		// Two clock ticks pass before the reuse, so the reused process cannot
		// have the same start ticks as the first one.
		await sleep(30);
		// ns_last_pid holds the PID that the kernel assigned last, so the next
		// fork receives the PID of the first process. Another process on the
		// host can take that PID first, so the attempt repeats.
		let reused: ChildProcess | undefined;
		const sudo = spawnSync("sudo", ["-n", "true"]).status === 0;
		for (let attempt = 0; sudo && attempt < 100 && reused === undefined; attempt++) {
			spawnSync("sudo", ["-n", "sh", "-c", `echo ${pid - 1} > /proc/sys/kernel/ns_last_pid`]);
			const candidate = spawn("sleep", ["300"]);
			cleanup.push(candidate);
			if (candidate.pid === pid) reused = candidate;
			else candidate.kill("SIGKILL");
		}
		if (process.env.TRELLIS_REQUIRE_PID_REUSE === "1") assert.ok(reused, `No process received PID ${pid} again`);
		const details: Record<string, unknown> = { pid, recorded: recorded.process.identity, realReuse: false };
		if (reused !== undefined) {
			await waitFor(() => inspectProcess(pid).kind === "live", "the reused process");
			const observation = inspectProcess(pid);
			if (observation.kind !== "live") throw new Error("The reused process must be live");
			assert.notEqual(observation.process.identity, recorded.process.identity);
			const session = { pid, endedAt: null } as RuntimeSession;
			assert.equal(observedSession(session, recorded.process.identity, observation, false).status, "exited");
			Object.assign(details, { realReuse: true, reused: observation.process.identity });
		}
		cases.push({ name: "pid-reuse", details });
	};

	const exitWatcher = async () => {
		const watcher = new ProcessExitWatcher();
		const child = spawn("sleep", ["300"]);
		cleanup.push(child);
		await waitFor(() => inspectProcess(child.pid!).kind === "live", "the watched process");
		const exited = new Promise<void>((resolve) => watcher.watch(child.pid!, resolve));
		child.kill("SIGKILL");
		await exited;
		watcher.close();
		cases.push({ name: "exit-watcher", details: { pid: child.pid } });
	};

	try {
		for (const run of [processTree, parentDeath, runtimeDeath, setsidSurvivor, cancellation, pidReuse, exitWatcher]) {
			await run();
			assert.deepEqual(launchDirectories(), [], `${run.name} leaves no launch cgroup`);
		}
		proof("passed");
		setImmediate(() => process.exit(0));
	} catch (error) {
		proof("failed", (error as Error).stack);
		throw error;
	} finally {
		for (const child of cleanup) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
		rmSync(scratch, { recursive: true, force: true });
	}
}

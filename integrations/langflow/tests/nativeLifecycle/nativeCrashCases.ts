import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPersistentNativeLifecycleFixture } from "../../fixtures/nativeHost/persistentNativeLifecycleSetup.ts";
import { crashCleanupEvidence, crashEvidence } from "./testEvidence.ts";

type Marker = {
	action: string;
	authorityPid: number;
	boundary: string;
	phase?: string;
	executionId?: string;
	stepId?: string;
	taskKey?: string;
	agentRunId?: string;
	attemptId?: string;
	nativePid?: number | null;
	launchedAt?: string | null;
	acknowledged?: boolean;
	acknowledgedMessageIds?: string[];
	taskRows?: number;
	bindingRows?: number;
	attemptRows?: number;
	resultId?: string | null;
	executionStatus?: string;
	claimAvailable?: boolean;
	launchState?: "unconfirmed";
	launches?: string[];
	snapshot?: { acknowledgedMessageIds: string[]; resultId: string | null };
};

const authorityPath = join(import.meta.dir, "../../fixtures/nativeHost/nativeLifecycleAuthority.ts");
const authorityPids = new Set<number>();
const nativePids = new Set<number>();
const homes = new Set<string>();

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw error;
	}
};

const stopPid = async (pid: number, signal: "SIGKILL" | "SIGTERM") => {
	if (alive(pid)) process.kill(pid, signal);
	while (alive(pid)) await Bun.sleep(5);
};

afterEach(async () => {
	const killedAuthorities = [...authorityPids];
	const stoppedNatives = [...nativePids];
	const removedHomes = [...homes];
	for (const pid of authorityPids) await stopPid(pid, "SIGKILL");
	for (const pid of nativePids) await stopPid(pid, "SIGTERM");
	for (const home of homes) await rm(home, { recursive: true, force: true });
	crashCleanupEvidence.push({
		authorityPids: killedAuthorities,
		nativePids: stoppedNatives,
		survivingAuthorityPids: killedAuthorities.filter(alive),
		survivingNativePids: stoppedNatives.filter(alive),
		homes: removedHomes,
		directoriesRemoved: removedHomes.every((home) => !existsSync(home)),
	});
	authorityPids.clear();
	nativePids.clear();
	homes.clear();
});

const worker = async (home: string, action: string, marker: string) => {
	await writeFile(join(home, "authority-invocation.json"), JSON.stringify({ home, action, marker }), { mode: 0o600 });
	const child = Bun.spawn([process.execPath, "test", authorityPath], {
		cwd: home,
		stdout: "pipe",
		stderr: "pipe",
	});
	authorityPids.add(child.pid);
	return child;
};

const waitForMarker = async (child: Awaited<ReturnType<typeof worker>>, path: string) => {
	const deadline = Date.now() + 30_000;
	while (!(await Bun.file(path).exists())) {
		if (child.exitCode !== null)
			throw new Error(
				`authority worker ${child.pid} exited ${child.exitCode}: ${await new Response(child.stderr).text()}`,
			);
		if (Date.now() >= deadline) throw new Error(`authority worker ${child.pid} did not reach its boundary`);
		await Bun.sleep(10);
	}
	return JSON.parse(await readFile(path, "utf8")) as Marker;
};

const killAtBoundary = async (home: string, action: string) => {
	const markerPath = join(home, `${action}-${crypto.randomUUID()}.json`);
	const child = await worker(home, action, markerPath);
	const marker = await waitForMarker(child, markerPath);
	expect(marker.authorityPid).toBe(child.pid);
	if (marker.nativePid !== null && marker.nativePid !== undefined) {
		expect(marker.nativePid).not.toBe(child.pid);
		nativePids.add(marker.nativePid);
	}
	process.kill(child.pid, "SIGKILL");
	const workerExit = await child.exited;
	expect(workerExit).not.toBe(0);
	if (marker.nativePid !== null && marker.nativePid !== undefined) expect(alive(marker.nativePid)).toBe(true);
	authorityPids.delete(child.pid);
	const evidence = { ...marker, signal: "SIGKILL", workerExit };
	crashEvidence.push(evidence);
	return evidence;
};

const runAuthority = async (home: string, action: string) => {
	const markerPath = join(home, `${action}-${crypto.randomUUID()}.json`);
	const child = await worker(home, action, markerPath);
	const workerExit = await child.exited;
	authorityPids.delete(child.pid);
	if (workerExit !== 0)
		throw new Error(`authority worker ${child.pid} exited ${workerExit}: ${await new Response(child.stderr).text()}`);
	const marker = JSON.parse(await readFile(markerPath, "utf8")) as Marker;
	expect(marker.authorityPid).toBe(child.pid);
	if (marker.nativePid !== null && marker.nativePid !== undefined) nativePids.add(marker.nativePid);
	return { ...marker, workerExit };
};

const createHome = async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-langflow-native-lifecycle-crash-"));
	homes.add(home);
	await createPersistentNativeLifecycleFixture(home);
	return home;
};

describe.serial("native authority process crash feasibility", () => {
	test("F4 kills the real reservation and launch writers at both persistence boundaries", async () => {
		const beforeHome = await createHome();
		const reservationBefore = await killAtBoundary(beforeHome, "reservation_before_commit");
		expect(reservationBefore).toMatchObject({
			boundary: "reservation",
			phase: "before_commit",
			taskRows: 1,
			bindingRows: 1,
			attemptRows: 1,
		});
		const rolledBack = await runAuthority(beforeHome, "inspect");
		expect(rolledBack).toMatchObject({ taskRows: 0, bindingRows: 0, attemptRows: 0 });

		const reservationCommitted = await killAtBoundary(beforeHome, "reservation_after_commit");
		expect(reservationCommitted).toMatchObject({
			boundary: "reservation",
			phase: "after_commit",
			taskRows: 1,
			bindingRows: 1,
			attemptRows: 1,
		});
		const launchBefore = await killAtBoundary(beforeHome, "launch_before_commit");
		expect(launchBefore).toMatchObject({
			boundary: "launch_status",
			phase: "before_commit",
			attemptId: reservationCommitted.attemptId,
		});
		expect(launchBefore.nativePid).not.toBe(launchBefore.authorityPid);
		const unknownLaunch = await runAuthority(beforeHome, "inspect");
		expect(unknownLaunch).toMatchObject({
			taskRows: 1,
			bindingRows: 1,
			attemptRows: 1,
			nativePid: null,
			launchedAt: null,
		});
		const unknownPid = launchBefore.nativePid!;
		expect(alive(unknownPid)).toBe(true);
		const admission = await runAuthority(beforeHome, "admission_probe");
		expect(admission).toMatchObject({
			boundary: "native_admission",
			phase: "restarted_authority",
			claimAvailable: false,
			attemptId: reservationCommitted.attemptId,
			nativePid: null,
			launchedAt: null,
			taskRows: 1,
			bindingRows: 1,
			attemptRows: 1,
		});
		crashEvidence.push({
			action: "launch_before_commit",
			authorityPid: launchBefore.authorityPid,
			boundary: "launch_status",
			phase: "before_commit",
			launchState: "unconfirmed",
			attemptId: reservationCommitted.attemptId,
			nativePid: unknownPid,
			launchedAt: null,
		});
		await stopPid(unknownPid, "SIGTERM");
		nativePids.delete(unknownPid);
		crashCleanupEvidence.push({
			boundary: "launch_status",
			phase: "before_commit",
			nativePid: unknownPid,
			survivingPids: [],
		});

		const retainedHome = await createHome();
		const retainedReservation = await killAtBoundary(retainedHome, "reservation_after_commit");
		const launchAfter = await killAtBoundary(retainedHome, "launch_after_commit");
		expect(launchAfter).toMatchObject({
			boundary: "launch_status",
			phase: "after_commit",
			attemptId: retainedReservation.attemptId,
		});
		expect(launchAfter.nativePid).not.toBe(launchAfter.authorityPid);
		const recoveredLaunch = await runAuthority(retainedHome, "launch_recover");
		expect(recoveredLaunch).toMatchObject({
			attemptId: retainedReservation.attemptId,
			nativePid: launchAfter.nativePid,
			launches: [],
			taskRows: 1,
			bindingRows: 1,
			attemptRows: 1,
		});
		expect(recoveredLaunch.launchedAt).not.toBeNull();
	}, 120_000);

	test("F4 kills prompt and result writers and keeps one original attempt and result", async () => {
		const home = await createHome();
		const reservation = await killAtBoundary(home, "reservation_after_commit");
		const launch = await killAtBoundary(home, "launch_after_commit");
		await runAuthority(home, "launch_recover");

		const promptBefore = await killAtBoundary(home, "prompt_before_commit");
		expect(promptBefore).toMatchObject({
			boundary: "prompt_receipt",
			phase: "before_commit",
			attemptId: reservation.attemptId,
		});
		expect(promptBefore.acknowledgedMessageIds).toEqual([reservation.attemptId!]);
		const beforeSnapshot = await runAuthority(home, "snapshot");
		expect(beforeSnapshot.snapshot?.acknowledgedMessageIds).toEqual([]);

		const promptAfter = await killAtBoundary(home, "prompt_after_commit");
		expect(promptAfter).toMatchObject({
			boundary: "prompt_receipt",
			phase: "after_commit",
			attemptId: reservation.attemptId,
		});
		const afterSnapshot = await runAuthority(home, "snapshot");
		expect(afterSnapshot.snapshot?.acknowledgedMessageIds).toEqual([reservation.attemptId!]);

		const resultBefore = await killAtBoundary(home, "result_before_commit");
		expect(resultBefore).toMatchObject({
			boundary: "result",
			phase: "before_commit",
			resultId: "result-native-crash",
			taskRows: 1,
			bindingRows: 1,
			attemptRows: 1,
		});
		const rolledBackResult = await runAuthority(home, "inspect");
		expect(rolledBackResult).toMatchObject({ resultId: null, executionStatus: "running" });

		const resultAfter = await killAtBoundary(home, "result_after_commit");
		expect(resultAfter).toMatchObject({
			boundary: "result",
			phase: "after_commit",
			resultId: "result-native-crash",
			taskRows: 1,
			bindingRows: 1,
			attemptRows: 1,
			executionStatus: "succeeded",
		});
		const retained = await runAuthority(home, "inspect");
		expect(retained).toMatchObject({
			stepId: reservation.stepId,
			attemptId: reservation.attemptId,
			nativePid: launch.nativePid,
			resultId: "result-native-crash",
			taskRows: 1,
			bindingRows: 1,
			attemptRows: 1,
			executionStatus: "succeeded",
		});
		const nativePid = retained.nativePid!;
		await stopPid(nativePid, "SIGTERM");
		nativePids.delete(nativePid);
		crashCleanupEvidence.push({
			boundary: "result",
			phase: "after_commit",
			nativePid,
			survivingPids: [],
		});
	}, 120_000);
});

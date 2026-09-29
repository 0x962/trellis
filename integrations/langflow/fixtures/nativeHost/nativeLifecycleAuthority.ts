import { test } from "bun:test";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProcessWriteBoundary } from "./deterministicProcess.ts";
import { openPersistentNativeLifecycleFixture } from "./persistentNativeLifecycleFixture.ts";

const invocation = JSON.parse(await readFile(join(process.cwd(), "authority-invocation.json"), "utf8")) as {
	home: string;
	action: string;
	marker: string;
};
const { home, action, marker } = invocation;

const publish = async (value: Record<string, unknown>) => {
	const temporary = `${marker}-${crypto.randomUUID()}.next`;
	await writeFile(temporary, JSON.stringify({ action, authorityPid: process.pid, ...value }), { mode: 0o600 });
	await rename(temporary, marker);
};

const pause = async (value: Record<string, unknown>) => {
	await publish(value);
	await Bun.sleep(86_400_000);
};

const processBoundary = (): ProcessWriteBoundary | undefined => {
	if (action === "launch_before_commit" || action === "launch_after_commit") {
		const phase = action === "launch_before_commit" ? "before_commit" : "after_commit";
		return {
			operation: "launch",
			phase,
			pause: (input) =>
				pause({
					boundary: "launch_status",
					phase,
					attemptId: input.attemptId,
					nativePid: input.pid,
					acknowledgedMessageIds: input.acknowledgedMessageIds,
					resultId: input.resultId,
				}),
		};
	}
	if (action === "prompt_before_commit" || action === "prompt_after_commit") {
		const phase = action === "prompt_before_commit" ? "before_commit" : "after_commit";
		return {
			operation: "prompt_receipt",
			phase,
			pause: (input) =>
				pause({
					boundary: "prompt_receipt",
					phase,
					attemptId: input.attemptId,
					nativePid: input.pid,
					acknowledgedMessageIds: input.acknowledgedMessageIds,
					resultId: input.resultId,
				}),
		};
	}
	return undefined;
};

test("runs one persistent native lifecycle boundary", async () => {
	const fixture = await openPersistentNativeLifecycleFixture(home, processBoundary());
	if (action === "reservation_before_commit") {
		await fixture.reserve((evidence) => pause({ boundary: "reservation", phase: "before_commit", ...evidence }));
		return;
	}
	if (action === "reservation_after_commit") {
		await fixture.reserve();
		await pause({ boundary: "reservation", phase: "after_commit", ...(await fixture.evidence()) });
		return;
	}
	if (action === "launch_before_commit" || action === "launch_after_commit") {
		await fixture.launch(await fixture.readClaim());
		return;
	}
	if (action === "launch_recover") {
		const claim = await fixture.readClaim();
		const launched = await fixture.launch(claim);
		await fixture.recordLaunch(claim, launched.launchedAt!);
		await publish({
			boundary: "launch_recover",
			phase: "committed",
			launches: fixture.processes.launches,
			...(await fixture.evidence()),
		});
		await fixture.close();
		return;
	}
	if (action === "admission_probe") {
		const claim = await fixture.claimAgain();
		await publish({
			boundary: "native_admission",
			phase: "restarted_authority",
			claimAvailable: claim !== null,
			...(await fixture.evidence()),
		});
		await fixture.close();
		return;
	}
	if (action === "prompt_before_commit" || action === "prompt_after_commit") {
		const claim = await fixture.readClaim();
		await fixture.processes.acknowledge(claim.attempt.id);
		return;
	}
	if (action === "snapshot") {
		const claim = await fixture.readClaim();
		const snapshot = await fixture.snapshot(claim);
		await publish({ boundary: "snapshot", snapshot, ...(await fixture.evidence()) });
		await fixture.close();
		return;
	}
	if (action === "result_before_commit") {
		const claim = await fixture.readClaim();
		await fixture.processes.complete(claim.attempt.id, "result-native-crash", "Crash result");
		const snapshot = await fixture.snapshot(claim);
		await fixture.recordObservation(claim, snapshot, (evidence) =>
			pause({ boundary: "result", phase: "before_commit", ...evidence }),
		);
		return;
	}
	if (action === "result_after_commit") {
		const claim = await fixture.readClaim();
		const snapshot = await fixture.snapshot(claim);
		await fixture.recordObservation(claim, snapshot);
		await pause({ boundary: "result", phase: "after_commit", ...(await fixture.evidence()) });
		return;
	}
	if (action === "inspect") {
		await publish({ boundary: "inspect", ...(await fixture.evidence()) });
		await fixture.close();
		return;
	}
	throw new Error(`unknown crash action ${action}`);
}, 120_000);

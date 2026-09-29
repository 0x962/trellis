import { expect, test } from "bun:test";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { persistentCancellationFixture } from "./persistentCancellationFixture.ts";
import { openPersistentNativeLifecycleFixture } from "./persistentNativeLifecycleFixture.ts";

const { home, action, marker } = JSON.parse(await readFile(join(process.cwd(), "cancel-invocation.json"), "utf8")) as {
	home: string;
	action: string;
	marker: string;
};
const publish = async (value: Record<string, unknown>) => {
	const temporary = `${marker}-${crypto.randomUUID()}.next`;
	await writeFile(temporary, JSON.stringify({ action, authorityPid: process.pid, ...value }), { mode: 0o600 });
	await rename(temporary, marker);
};

test("runs one persistent cancellation boundary", async () => {
	const fixture = await openPersistentNativeLifecycleFixture(home);
	const controls = persistentCancellationFixture(fixture);
	const evidence = async () => {
		const value = await fixture.evidence();
		const native = value.nativePid === null ? null : await fixture.processes.inspect(value.attemptId);
		return { ...value, nativeStatus: native?.status ?? null, nativeExitCode: native?.exitCode ?? null };
	};
	try {
		if (action === "launch") {
			const claim = await fixture.reserve();
			const launched = await fixture.launch(claim);
			await fixture.recordLaunch(claim, launched.launchedAt!);
		} else if (action === "cancel_before_commit" || action === "cancel_after_commit") {
			const before = await controls.state();
			const stable = await evidence();
			const pause = async (state: Awaited<ReturnType<typeof controls.state>>) => {
				await publish({ boundary: action, ...stable, state });
				await Bun.sleep(86_400_000);
			};
			if (action === "cancel_before_commit") await controls.cancelAt(before.revision, pause);
			else await pause(await controls.cancelAt(before.revision));
		} else if (action === "stop_failure" || action === "stop") {
			const errors = await controls.stop(action === "stop_failure" ? "fixture_stop_unconfirmed" : null);
			await publish({ ...(await evidence()), state: await controls.state(), errors });
			return;
		} else if (action === "output_then_cancel" || action === "cancel_then_output") {
			const claim = await fixture.readClaim();
			const revision = (await controls.state()).revision;
			if (action === "cancel_then_output") await controls.cancelAt(revision);
			await fixture.processes.complete(claim.attempt.id, "result-cancel-race", "Final output from fixture");
			const snapshot = await fixture.snapshot(claim);
			const recorded = await fixture.recordObservation(claim, snapshot);
			if (action === "output_then_cancel") {
				await expect(controls.cancelAt(revision)).rejects.toMatchObject({ code: "FLOW_VERSION_CONFLICT" });
				await controls.cancelAt((await controls.state()).revision);
			}
			await publish({ ...(await evidence()), state: await controls.state(), recorded, snapshot });
			return;
		} else if (action === "decision_then_cancel" || action === "cancel_then_decision") {
			const before = await controls.state();
			const key = before.steps.find((step) => step.nodeId === "human")!.key;
			if (action === "decision_then_cancel") {
				await controls.decideAt(before.revision, key);
				await expect(controls.cancelAt(before.revision)).rejects.toMatchObject({ code: "FLOW_VERSION_CONFLICT" });
				await controls.cancelAt((await controls.state()).revision);
			} else {
				await controls.cancelAt(before.revision);
				await expect(controls.decideAt(before.revision, key)).rejects.toMatchObject({ code: "FLOW_VERSION_CONFLICT" });
				await expect(controls.decideAt((await controls.state()).revision, key)).rejects.toThrow("not waiting");
			}
		} else if (action !== "inspect") throw new Error(`unknown cancellation action ${action}`);
		const claim = await fixture.claimAgain();
		await publish({ ...(await evidence()), state: await controls.state(), claimAvailable: claim !== null });
	} finally {
		await fixture.close();
	}
}, 120_000);

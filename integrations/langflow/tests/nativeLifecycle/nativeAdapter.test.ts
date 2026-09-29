import { describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { nativeAdapterCase } from "../../fixtures/nativeHost/nativeAdapterCase.ts";

describe.serial("native adapter with a real fixture process", () => {
	test("recovers a committed reservation after a database reopen without a replacement attempt", async () => {
		await nativeAdapterCase(async ({ current, reopen }) => {
			const reserved = await current().reserve();
			expect(reserved.replay).toBe(false);
			const original = reserved.reservation;
			expect(original.launchSnapshotDigest).toMatch(/^[a-f0-9]{64}$/);
			expect(original.taskKey).toBe("root/501/review/step/51");
			expect(original.launchReceipt).toBeNull();
			expect(await current().processes.records()).toEqual([]);
			await reopen();
			expect((await current().read(original.stepId)).handle).toEqual(original.handle);
			const recovered = await current().recover(original.stepId);
			expect(recovered.status).toBe("dispatched");
			expect(recovered.handle.attemptId).toBe(original.attemptId);
			const runtime = await current().processes.inspect(original.attemptId);
			expect(runtime.pid).toBeGreaterThan(0);
			process.kill(runtime.pid!, 0);
			expect((await current().read(original.stepId)).launchReceipt?.launchedAt).toBe(runtime.startedAt);
			expect((await current().recover(original.stepId)).status).toBe("observation_required");
			expect((await current().request()).stepId).toBe(original.stepId);
			expect(current().processes.launches).toEqual([original.attemptId]);
			expect(await current().counts()).toEqual({ handles: 1, attempts: 1, completions: 0 });
			expect((await current().read(original.stepId)).provenance).toEqual(original.provenance);
			console.log(JSON.stringify({
				kind: "native-adapter-reserved-recovery",
				stepId: original.stepId,
				attemptId: original.attemptId,
				pid: runtime.pid,
				startedAt: runtime.startedAt,
			}));
		});
	}, 120_000);

	test("retains a launched child after a lost response and accepts its late session and exact prompt receipt", async () => {
		await nativeAdapterCase(async ({ current, reopen }) => {
			current().processes.delayNextSession();
			current().processes.loseNextLaunchResponse();
			await expect(current().request()).rejects.toThrow("response was lost");
			const handle = await current().request();
			const original = await current().read(handle.stepId);
			const runtime = await current().processes.inspect(handle.attemptId);
			expect(runtime.agent?.sessionId).toBeNull();
			expect(original.launchReceipt).toBeNull();
			await reopen();
			expect((await current().recover(handle.stepId)).status).toBe("observation_required");
			expect(current().processes.launches).toEqual([]);
			expect((await current().processes.inspect(handle.attemptId)).pid).toBe(runtime.pid);
			const missingSession = await current().observe(handle.stepId);
			expect(missingSession.completion).toBeNull();
			expect(missingSession.handle.providerSessionId).toBeNull();
			expect((await current().read(handle.stepId)).launchReceipt?.launchedAt).toBe(runtime.startedAt);
			await current().processes.attachSession(handle.attemptId, "fixture-late-session");
			const attached = await current().observe(handle.stepId);
			expect(attached.handle.providerSessionId).toBe("fixture-late-session");
			await current().processes.complete(handle.attemptId, "fixture-result", "Exact native output");
			await current().processes.acknowledge(handle.attemptId, "wrong-prompt-receipt", "idle");
			const wrongPrompt = await current().observe(handle.stepId);
			expect(wrongPrompt.completion).toBeNull();
			expect(wrongPrompt.reason).toBe("prompt_or_result_missing");
			await current().processes.acknowledge(handle.attemptId, handle.attemptId, "idle");
			const accepted = await current().observe(handle.stepId);
			expect(accepted.completion?.completion.result).toMatchObject({
				attemptId: handle.attemptId,
				providerSessionId: "fixture-late-session",
				promptReceiptId: handle.attemptId,
				output: "Exact native output",
			});
			await reopen();
			const replay = await current().observe(handle.stepId);
			expect(replay.completion).toEqual(accepted.completion);
			expect((await current().read(handle.stepId)).provenance).toEqual(original.provenance);
			expect(await current().counts()).toEqual({ handles: 1, attempts: 1, completions: 1 });
			await expect(current().request(`${current().requestBytes}\n`)).rejects.toThrow("identity_conflict");
			await current().processes.complete(handle.attemptId, "fixture-result", "Changed output");
			await expect(current().observe(handle.stepId)).rejects.toThrow("identity_conflict");
			expect(await current().counts()).toEqual({ handles: 1, attempts: 1, completions: 1 });
			console.log(JSON.stringify({
				kind: "native-adapter-lost-response",
				stepId: handle.stepId,
				attemptId: handle.attemptId,
				pid: runtime.pid,
				resultId: accepted.completion?.resultId,
			}));
		});
	}, 120_000);

	test("refuses recovery when the committed attempt loses its private snapshot", async () => {
		await nativeAdapterCase(async ({ current, home, reopen }) => {
			const reserved = await current().reserve();
			const { stepId, attemptId, handle } = reserved.reservation;
			await rm(join(home, "harness-attempts", attemptId, "langflow-launch.json"));
			await reopen();
			await expect(current().recover(stepId)).rejects.toThrow();
			expect((await current().read(stepId)).handle).toEqual(handle);
			expect(await current().processes.records()).toEqual([]);
			expect(await current().counts()).toEqual({ handles: 1, attempts: 1, completions: 0 });
		});
	}, 120_000);
});

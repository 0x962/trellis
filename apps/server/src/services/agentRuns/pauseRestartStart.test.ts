import { expect, test } from "bun:test";
import type { startNative } from "./nativeStart.ts";
import { prepareStart } from "../sessions/start.ts";
import { pauseRestartFixture } from "./pauseRestartFixture/index.ts";

const fixture = pauseRestartFixture();

test("a start refuses an attempt that no capture and no runtime record vouch for", async () => {
	const { runId, sessionRowId } = await fixture.seed({
		terminalId: crypto.randomUUID(),
		sessionId: fixture.providerSessionId,
	});

	await expect(
		prepareStart(
			fixture.context(),
			{ id: sessionRowId },
			{ process: fixture.forgotten, start: async () => ({ id: runId }), preset: async () => "claude" },
		),
	).rejects.toThrow("The prior launch is not confirmed");
});

test("a start after a restart resumes the provider conversation of a paused session", async () => {
	const terminalId = crypto.randomUUID();
	const { runId, sessionRowId } = await fixture.seed({
		terminalId,
		sessionId: fixture.providerSessionId,
	});
	await fixture.writeCapture(runId, terminalId);
	const launches: Parameters<typeof startNative>[1][] = [];
	fixture.resetPending();

	await prepareStart(
		fixture.context(),
		{ id: sessionRowId },
		{
			process: fixture.forgotten,
			start: async (_background, input) => {
				launches.push(input);
				return { id: runId };
			},
			preset: async () => "claude",
		},
	);
	await fixture.waitForPending();

	expect(launches).toHaveLength(1);
	expect(launches[0]).toMatchObject({ resume: true, previousAttemptId: terminalId });
	const stored = await fixture.storedRun(runId);
	expect(stored.sessionId).toBe(fixture.providerSessionId);
	expect(stored.terminalId).not.toBe(terminalId);
	expect(stored.closedAt).toBeNull();
});

test("a start after a restart keeps no conversation the run never held", async () => {
	const terminalId = crypto.randomUUID();
	const { runId, sessionRowId } = await fixture.seed({ terminalId, sessionId: null });
	await fixture.writeCapture(runId, terminalId);
	const launches: Parameters<typeof startNative>[1][] = [];
	fixture.resetPending();

	await prepareStart(
		fixture.context(),
		{ id: sessionRowId },
		{
			process: fixture.forgotten,
			start: async (_background, input) => {
				launches.push(input);
				return { id: runId };
			},
			preset: async () => "claude",
		},
	);
	await fixture.waitForPending();

	expect(launches[0]).toMatchObject({ resume: false, previousAttemptId: null });
});

test("a session that ended on its own resumes after a restart", async () => {
	const terminalId = crypto.randomUUID();
	const { runId, sessionRowId } = await fixture.seed({
		terminalId,
		sessionId: fixture.providerSessionId,
	});
	await fixture.reconcile(terminalId);
	expect(await fixture.closedAt(runId)).toBeNull();
	const launches: Parameters<typeof startNative>[1][] = [];
	fixture.resetPending();

	await prepareStart(
		fixture.context(),
		{ id: sessionRowId },
		{
			process: fixture.forgotten,
			start: async (_background, input) => {
				launches.push(input);
				return { id: runId };
			},
			preset: async () => "claude",
		},
	);
	await fixture.waitForPending();

	expect(launches[0]).toMatchObject({ resume: true, previousAttemptId: terminalId });
	expect((await fixture.storedRun(runId)).sessionId).toBe(fixture.providerSessionId);
});

test("an exit the execution service cannot read stays unrecorded", async () => {
	const terminalId = crypto.randomUUID();
	const { runId, sessionRowId } = await fixture.seed({
		terminalId,
		sessionId: fixture.providerSessionId,
	});
	await fixture.reconcileWithoutOutput(terminalId);

	await expect(
		prepareStart(
			fixture.context(),
			{ id: sessionRowId },
			{ process: fixture.forgotten, start: async () => ({ id: runId }), preset: async () => "claude" },
		),
	).rejects.toThrow("The prior launch is not confirmed");
});

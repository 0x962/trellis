import { expect, test } from "bun:test";
import { pauseRestartFixture } from "./pauseRestartFixture/index.ts";
import { stopRunProcess } from "./stopRunProcess.ts";

const fixture = pauseRestartFixture();

test("an archive refuses an attempt that no capture and no runtime record vouch for", async () => {
	const terminalId = crypto.randomUUID();
	const { runId } = await fixture.seed({ terminalId, sessionId: fixture.providerSessionId });
	const run = await fixture.storedRun(runId);

	await expect(
		stopRunProcess(fixture.context(), run, {
			process: fixture.forgotten,
			stop: async () => {
				throw new Error("the service stopped a process it could not read");
			},
		}),
	).rejects.toThrow("The prior launch is not confirmed");
});

test("an archive after a restart closes the run of a paused session", async () => {
	const terminalId = crypto.randomUUID();
	const { runId } = await fixture.seed({ terminalId, sessionId: fixture.providerSessionId });
	await fixture.writeCapture(runId, terminalId);
	const run = await fixture.storedRun(runId);

	await stopRunProcess(fixture.context(), run, {
		process: fixture.forgotten,
		stop: async () => {
			throw new Error("the service stopped a process that had already ended");
		},
	});

	expect(await fixture.closedAt(runId)).not.toBeNull();
});

test("a session that ended on its own archives after a restart", async () => {
	const terminalId = crypto.randomUUID();
	const { runId } = await fixture.seed({ terminalId, sessionId: fixture.providerSessionId });
	await fixture.reconcile(terminalId);
	const run = await fixture.storedRun(runId);

	await stopRunProcess(fixture.context(), run, {
		process: fixture.forgotten,
		stop: async () => {
			throw new Error("the service stopped a process that had already ended");
		},
	});

	expect(await fixture.closedAt(runId)).not.toBeNull();
});

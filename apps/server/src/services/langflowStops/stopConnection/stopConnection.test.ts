import { afterEach, expect, test } from "bun:test";
import { SYSTEM_ACTOR } from "../../../context";
import { readProjection, readProjectionFacts } from "../../../db/queries/langflowExecution";
import { ids } from "../../../db/queries/langflowExecution/fixtures/fixture";
import { readCancellationReceipt } from "../readCancellationReceipt";
import { withAttemptOperation } from "../withAttemptOperation";
import { connectionFixture } from "./components/fixture";

let fixture: Awaited<ReturnType<typeof connectionFixture>>;
afterEach(async () => fixture.close());
const input = { executionId: ids.execution };
const read = () =>
	fixture.database.run((tx) => readCancellationReceipt({ ...fixture.database.core, actor: SYSTEM_ACTOR }, tx, input));

test("native exit commits during engine outage and startup recovery delivers the retained cancellation", async () => {
	fixture = await connectionFixture();
	const before = await fixture.database.run((tx) => readProjectionFacts(tx, input));
	fixture.behavior.unavailable = true;
	await expect((await fixture.connect()).committed(input)).rejects.toThrow();
	const stopped = await read();
	expect(stopped.needsStop).toBe(false);
	expect(stopped.acknowledgement).toBeNull();
	expect(stopped.stops[0]!.exitReceipt?.attemptId).toBe(fixture.handle.attemptId);
	fixture.behavior.unavailable = false;
	await (await fixture.connect()).recover();
	expect((await read()).acknowledgement?.engineStatus).toBe("cancelled");
	expect(fixture.behavior.stopped).toEqual([fixture.handle.attemptId]);
	expect(fixture.control.gate.read().permits[0]!.terminal).not.toBeNull();
	const after = await fixture.database.run((tx) => readProjectionFacts(tx, input));
	expect(after.deadlines).toEqual(before.deadlines);
});

test("lost engine responses retain the permit and recover without another native stop", async () => {
	fixture = await connectionFixture();
	fixture.behavior.lost = true;
	await expect((await fixture.connect()).committed(input)).rejects.toThrow();
	expect(fixture.control.gate.read().permits[0]!.terminal).toBeNull();
	expect((await read()).acknowledgement).toBeNull();
	fixture.behavior.lost = false;
	await (await fixture.connect()).recover();
	expect(fixture.behavior.engineCalls).toBe(2);
	expect(fixture.behavior.stopped).toHaveLength(1);
	expect(fixture.control.gate.read().permits).toHaveLength(1);
	expect(fixture.control.gate.read().permits[0]!.terminal).not.toBeNull();
});

test("nonterminal engine acceptance and a failed native stop both remain pending", async () => {
	fixture = await connectionFixture();
	fixture.behavior.status = "in_progress";
	fixture.behavior.stopFails = true;
	await expect((await fixture.connect()).committed(input)).rejects.toThrow();
	const pending = await read();
	expect(pending.acknowledgement?.engineStatus).toBe("in_progress");
	expect(pending.needsStop).toBe(true);
	expect(pending.stops[0]!.state).toBe("ownership_unknown");
	expect(fixture.control.gate.read().permits[0]!.terminal).toBeNull();
	fixture.behavior.stopFails = false;
	fixture.behavior.status = "failed";
	await (await fixture.connect()).recover();
	const settled = await read();
	expect(settled.acknowledgement?.receipt).toEqual(pending.acknowledgement?.receipt);
	expect(settled.acknowledgement?.engineStatus).toBe("failed");
	expect(settled.needsStop).toBe(false);
	const projected = await fixture.database.run((tx) => readProjection(tx, input));
	expect(projected!.view.status).toBe("canceled");
});

test("the launch lock delays exact stop and a response for another attempt cannot confirm exit", async () => {
	fixture = await connectionFixture();
	fixture.behavior.wrongAttempt = true;
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const launch = withAttemptOperation(fixture.home, fixture.handle.attemptId, async () => {
		entered.resolve();
		await release.promise;
	});
	await entered.promise;
	const connection = await fixture.connect();
	const pending = connection.committed(input);
	const rejected = expect(pending).rejects.toThrow();
	expect(fixture.behavior.stopped).toEqual([]);
	release.resolve();
	await launch;
	await rejected;
	expect((await read()).needsStop).toBe(true);
	expect((await read()).stops[0]!.exitReceipt).toBeNull();
	expect(fixture.behavior.stopped).toEqual([fixture.handle.attemptId]);
});

test("an expired grant and closed dispatch gate do not block native exit", async () => {
	fixture = await connectionFixture();
	fixture.behavior.at = new Date(Date.parse(fixture.authority.expiresAt) + 1000);
	fixture.control.gate.closeDispatch({
		requestId: crypto.randomUUID(),
		reason: { kind: "capture", snapshotId: "capture" },
	});
	await expect((await fixture.connect()).committed(input)).rejects.toThrow();
	expect((await read()).needsStop).toBe(false);
	expect((await read()).acknowledgement).toBeNull();
	expect(fixture.behavior.engineCalls).toBe(0);
});

test("a receipt for another execution cannot settle cancellation", async () => {
	fixture = await connectionFixture();
	fixture.behavior.corruptReceipt = true;
	await expect((await fixture.connect()).committed(input)).rejects.toThrow();
	expect((await read()).acknowledgement).toBeNull();
	expect(fixture.control.gate.read().permits[0]!.terminal).toBeNull();
});

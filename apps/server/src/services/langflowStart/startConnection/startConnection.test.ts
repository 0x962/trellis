import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { startState } from "../startState";
import { connectionFixture } from "./components/connectionFixture/connectionFixture";

const opened: Awaited<ReturnType<typeof connectionFixture>>[] = [];
afterEach(async () => {
	for (const fixture of opened.splice(0)) await fixture.close();
});
async function fixture() {
	const value = await connectionFixture();
	opened.push(value);
	return value;
}
const count = (f: Awaited<ReturnType<typeof fixture>>, path: string) =>
	f.requests.filter((request) => request.path === `/trellis-v1/${path}`).length;
const permit = (f: Awaited<ReturnType<typeof fixture>>) =>
	f.control.gate.read().permits.find((entry) => entry.permit.binding.executionId === f.executionId)!;

test("committed admission uses authenticated HTTP after database commits and settles from the saved acknowledgement", async () => {
	const f = await fixture();
	const connection = await f.connect();
	expect(await connection.committed({ executionId: f.executionId })).toBeUndefined();
	expect(count(f, "admission/submit")).toBe(1);
	expect(count(f, "admission/open")).toBe(1);
	expect(permit(f).terminal?.outcome).toBe("completed");
	await (await f.connect()).recover();
	expect(count(f, "admission/open")).toBe(1);
});

test("an unknown lookup leaves admission closed and retains its permit", async () => {
	const f = await fixture();
	f.behavior.unknownLookup = true;
	await (await f.connect()).committed({ executionId: f.executionId });
	expect(count(f, "admission/submit")).toBe(0);
	expect(count(f, "admission/open")).toBe(0);
	expect(permit(f).terminal).toBeNull();
	const row = await f.database.run((tx) => f.database.store.readSubmission(tx, { executionId: f.executionId }));
	expect(row.submission.state).toBe("submission_unknown");
	expect(row.admission.state).toBe("closed");
});

test("recovery finds a submission whose response was lost without submitting another job", async () => {
	const f = await fixture();
	f.behavior.loseSubmission = true;
	await (await f.connect()).committed({ executionId: f.executionId });
	expect(permit(f).terminal).toBeNull();
	await (await f.connect()).recover();
	expect(count(f, "admission/submit")).toBe(1);
	expect(count(f, "admission/open")).toBe(1);
	expect(permit(f).terminal?.outcome).toBe("completed");
});

test("recovery repeats the exact admission and authority bytes after a lost acknowledgement", async () => {
	const f = await fixture();
	f.behavior.loseAdmission = true;
	await (await f.connect()).committed({ executionId: f.executionId });
	expect(permit(f).terminal).toBeNull();
	const before = f.requests.find((request) => request.path.endsWith("/admission/open"))!.body;
	f.behavior.loseAdmission = false;
	await (await f.connect()).recover();
	const delivered = f.requests.filter((request) => request.path.endsWith("/admission/open"));
	expect(delivered.map((request) => request.body)).toEqual([before, before]);
	expect(count(f, "admission/submit")).toBe(1);
	expect(permit(f).terminal?.outcome).toBe("completed");
});

test("a committed acknowledgement repairs archive settlement without another engine call", async () => {
	const f = await fixture();
	const settle = f.control.gate.settle.bind(f.control.gate);
	f.control.gate.settle = async () => { throw new Error("crash_before_settlement"); };
	await expect((await f.connect()).committed({ executionId: f.executionId })).rejects.toThrow("crash_before_settlement");
	f.control.gate.settle = settle;
	await (await f.connect()).recover();
	expect(count(f, "admission/open")).toBe(1);
	expect(permit(f).terminal?.outcome).toBe("completed");
});

test("a closed dispatch gate prevents new submission", async () => {
	const f = await fixture();
	f.control.gate.closeDispatch({ requestId: "capture", reason: { kind: "capture", snapshotId: "fixture" } });
	await expect((await f.connect()).committed({ executionId: f.executionId })).rejects.toThrow();
	expect(f.requests).toHaveLength(0);
});

test("canceled reservations with unknown correlation only repeat lookup", async () => {
	const f = await fixture();
	f.behavior.unknownLookup = true;
	await (await f.connect()).committed({ executionId: f.executionId });
	await f.database.db.execute(sql`UPDATE langflow_executions SET cancel_intent=${JSON.stringify({ version: 1, executionId: f.executionId, requestId: crypto.randomUUID(), actor: { kind: "human", name: "test" }, expectedRevision: 1, requestedAt: f.database.ctx.now.toISOString() })}::jsonb WHERE execution_id=${f.executionId}`);
	const before = f.requests.length;
	await (await f.connect()).recover();
	expect(f.requests).toHaveLength(before + 1);
	expect(count(f, "admission/submit")).toBe(0);
	expect(count(f, "admission/open")).toBe(0);
	expect(permit(f).terminal).toBeNull();
});

test("internal state rejects a human actor and a different host", async () => {
	const f = await fixture();
	await expect(f.database.run((tx) => startState(f.database.ctx, tx, {
		operation: "read", hostId: f.control.identity.hostId, input: { executionId: f.executionId },
	}))).rejects.toThrow("langflow_internal_start_required");
	await expect(f.state({ operation: "read", hostId: "foreign", input: { executionId: f.executionId } }))
		.rejects.toThrow("start_host_conflict");
});

test("an aborted host prevents new requests", async () => {
	const f = await fixture();
	const connection = await f.connect();
	f.signal.abort();
	await expect(connection.committed({ executionId: f.executionId })).rejects.toThrow();
	expect(f.requests).toHaveLength(0);
});


test("a crash before association recovers the archived grant before admission", async () => {
	const f = await fixture();
	f.behavior.failBeforeBind = true;
	await expect((await f.connect()).committed({ executionId: f.executionId })).rejects.toThrow("crash_before_binding");
	expect(count(f, "admission/open")).toBe(0);
	f.behavior.failBeforeBind = false;
	await (await f.connect()).recover();
	expect(count(f, "admission/submit")).toBe(1);
	expect(count(f, "admission/open")).toBe(1);
	expect(permit(f).terminal?.outcome).toBe("completed");
});

test("cancellation recovers an unknown submission under a cancel-only grant", async () => {
	const f = await fixture();
	f.behavior.loseSubmission = true;
	await (await f.connect()).committed({ executionId: f.executionId });
	const cancelIntent = { version: 1, executionId: f.executionId, requestId: crypto.randomUUID(),
		actor: { kind: "human", name: "test" }, expectedRevision: 1, requestedAt: f.database.ctx.now.toISOString() };
	await f.database.db.execute(sql`UPDATE langflow_executions SET cancel_intent=${JSON.stringify(cancelIntent)}::jsonb WHERE execution_id=${f.executionId}`);
	await (await f.connect()).recover();
	const row = await f.database.run((tx) => f.database.store.readSubmission(tx, { executionId: f.executionId }));
	expect(row.correlation).not.toBeNull();
	expect(row.authority?.permissions).toEqual(["execution.cancel"]);
	expect(row.admission.state).toBe("closed");
	expect(count(f, "admission/submit")).toBe(1);
	expect(count(f, "admission/open")).toBe(0);
	expect(permit(f).terminal).toBeNull();
});

test("recovery settles a retained admission delivery after the original start permit is terminal", async () => {
	const f = await fixture();
	await (await f.connect()).committed({ executionId: f.executionId });
	const original = permit(f);
	const row = await f.database.run((tx) => f.database.store.readSubmission(tx, { executionId: f.executionId }));
	if (row.admission.state !== "open") throw new Error("fixture_admission_missing");
	const delivery = f.control.gate.acquire({ ...original.permit.binding,
		effectId: `${original.permit.binding.effectId}:${row.admission.receipt.admissionId}` });
	await (await f.connect()).recover();
	expect(f.control.gate.recoverPermit(delivery.binding)?.terminal?.outcome).toBe("completed");
	expect(count(f, "admission/open")).toBe(1);
});

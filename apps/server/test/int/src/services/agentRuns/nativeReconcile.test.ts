import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { HarnessSnapshot } from "../../../../../src/agents/nativeHarness/types.ts";
import {
	getNativeObservation,
	prepareNativeReconcile,
	reconcileNativeObservation,
} from "../../../../../src/services/agentRuns/nativeReconcile.ts";
import type { ServiceCtx } from "../../../../../src/services/support.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let ticket: string;
let runId: string;
let attemptId: string;
const snapshot: HarnessSnapshot = {
	state: "idle",
	sessionId: "session",
	acknowledgedMessageIds: ["message"],
	pendingPermissions: [],
	result: "Output exists",
	error: null,
	transcript: [{ role: "assistant", text: "Output exists" }],
};
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		const project = await seedRoot(tx, "OBS");
		const status = await seedStatus(tx, {
			projectId: project,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		ticket = await seedTicket(tx, { projectId: project, rootId: project, statusId: status });
		runId = randomUUID();
		attemptId = randomUUID();
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,ticket_id,ticket_identifier,state,terminal_id,session_id,created_at,updated_at) VALUES (${runId},'Observer','native','Builder','builder','Build',${project},'OBS',${ticket},'OBS-1','running',${attemptId},'session',now(),now())`,
		);
		await tx.execute(
			sql`INSERT INTO agent_execution_attempts (id,run_id,generation,token_hash,created_at) VALUES (${attemptId},${runId},1,'hash',now())`,
		);
	});
});
const record = (value = snapshot, id = attemptId) =>
	h.run((ctx, tx) =>
		reconcileNativeObservation({ ...ctx, now: () => ctx.now } as unknown as ServiceCtx, tx, {
			runId,
			attemptId: id,
			snapshot: value,
		}),
	);
test("the same completed turn produces one activity after host restart", async () => {
	expect(await record()).toBe(true);
	expect(await record(structuredClone(snapshot))).toBe(false);
	expect(await h.rows(sql`SELECT * FROM agent_harness_observations`)).toHaveLength(1);
	expect(await h.rows(sql`SELECT * FROM activity WHERE action = 'agent.turn.completed'`)).toHaveLength(1);
	expect(h.flushed.filter((event) => event.type === "agent-runs.changed")).toHaveLength(1);
});
test("a stale attempt cannot overwrite the current attempt or produce activity", async () => {
	await h.rows(sql`UPDATE agent_runs SET terminal_id = 'replacement' WHERE id = ${runId}`);
	expect(await record()).toBe(false);
	expect(await h.rows(sql`SELECT * FROM agent_harness_observations`)).toHaveLength(0);
	expect(await h.rows(sql`SELECT * FROM activity`)).toHaveLength(0);
});
test("a manager observation produces no ticket event", async () => {
	await h.rows(sql`UPDATE agent_runs SET kind = 'manager' WHERE id = ${runId}`);
	await record();
	expect(await h.rows(sql`SELECT * FROM activity`)).toHaveLength(0);
});
test("new transcript text does not repeat a completed turn event", async () => {
	await record();
	await record({ ...snapshot, transcript: [...snapshot.transcript, { role: "assistant", text: "More detail" }] });
	expect(await h.rows(sql`SELECT * FROM activity WHERE action = 'agent.turn.completed'`)).toHaveLength(1);
});
test("a reconnect does not announce the same turn again", async () => {
	await record();
	await record({ ...snapshot, state: "unknown", error: "Runtime disconnected" });
	await record();
	expect(await h.rows(sql`SELECT * FROM activity WHERE action = 'agent.turn.completed'`)).toHaveLength(1);
	await record({ ...snapshot, acknowledgedMessageIds: ["message", "next-message"] });
	expect(await h.rows(sql`SELECT * FROM activity WHERE action = 'agent.turn.completed'`)).toHaveLength(2);
});
const prepareCtx = () =>
	({
		...h.ctx((event) => h.flushed.push(event)),
		now: () => new Date("2026-09-14T00:00:00Z"),
		newTx: h.read,
		home: "/tmp/unused-native-observation",
	}) as unknown as ServiceCtx;
test("background reconciliation records an exited worker without a UI call", async () => {
	const result = await prepareNativeReconcile(
		prepareCtx(),
		{},
		{
			refresh: async () => {
				await h.rows(sql`UPDATE agent_runs SET state='exited' WHERE id=${runId}`);
			},
			observe: async () => snapshot,
		},
	);
	expect(result).toEqual({ observed: 1, changed: 1 });
	expect((await h.one(sql`SELECT state FROM agent_runs WHERE id=${runId}`)).state).toBe("exited");
	expect((await h.read((tx) => getNativeObservation(tx, attemptId)))?.result).toBe("Output exists");
});
test("runtime failure preserves the transcript and result in the database", async () => {
	await record();
	await prepareNativeReconcile(
		prepareCtx(),
		{},
		{
			refresh: async () => {},
			observe: async () => {
				throw new Error("Runtime unavailable");
			},
		},
	);
	const persisted = await h.read((tx) => getNativeObservation(tx, attemptId));
	expect(persisted?.state).toBe("unknown");
	expect(persisted?.result).toBe("Output exists");
	expect(persisted?.transcript).toEqual(snapshot.transcript);
});
test("background observation leaves an in-flight launch to its owner", async () => {
	await h.rows(sql`UPDATE agent_runs SET state='starting' WHERE id=${runId}`);
	let refreshed = false;
	const result = await prepareNativeReconcile(
		prepareCtx(),
		{},
		{
			refresh: async () => {
				refreshed = true;
			},
			observe: async () => snapshot,
		},
	);
	expect(refreshed).toBe(false);
	expect(result.observed).toBe(0);
});
test("an expired runtime log cannot erase the saved transcript", async () => {
	await record();
	await record({
		...snapshot,
		state: "unknown",
		error: "Earlier output expired",
		result: null,
		transcript: [],
		acknowledgedMessageIds: [],
	});
	const persisted = await h.read((tx) => getNativeObservation(tx, attemptId));
	expect(persisted?.transcript).toEqual(snapshot.transcript);
	expect(persisted?.result).toBe(snapshot.result);
});
test("an exited attempt stays eligible until its final process observation is saved", async () => {
	await record();
	await h.rows(sql`UPDATE agent_runs SET state='exited' WHERE id=${runId}`);
	const deps = { refresh: async () => {}, observe: async () => snapshot };
	expect((await prepareNativeReconcile(prepareCtx(), {}, deps)).observed).toBe(1);
	await h.rows(
		sql`UPDATE agent_harness_observations SET checkpoint='{"processExited":true}'::jsonb WHERE attempt_id=${attemptId}`,
	);
	expect((await prepareNativeReconcile(prepareCtx(), {}, deps)).observed).toBe(0);
});

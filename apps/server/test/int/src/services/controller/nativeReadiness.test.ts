import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { reserveAttempt } from "../../../../../src/services/assignments/attempts.ts";
import { collect } from "../../../../../src/services/controller/collect.ts";
import { claim, complete, recover, retry } from "../../../../../src/services/controller/controller.ts";
import { dispatchMessageId } from "../../../../../src/services/controller/messageId.ts";
import { reconcile } from "../../../../../src/services/controller/reconcile.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedActivity, seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let projectId: string;
let attemptId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.run(async (ctx, tx) => {
		projectId = await seedRoot(tx, "NRD", {
			manager_config: { personaId: "persona", concurrency: 1, ade: "native", harness: { preset: "claude" } },
		});
		const statusId = await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
		const ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId });
		await seedActors(tx);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,state,session_id,created_at,updated_at) VALUES ('manager','Manager','native','Manager','manager','',${projectId},'NRD','running','session',${NOW},${NOW})`,
		);
		const attempt = await reserveAttempt(ctx, tx, { runId: "manager" });
		attemptId = attempt.id;
		await tx.execute(sql`UPDATE agent_runs SET terminal_id=${attemptId} WHERE id='manager'`);
		await seedActivity(tx, {
			projectId,
			rootId: projectId,
			ticketId,
			actor: { name: "dana", kind: "human" },
			createdAt: NOW,
		});
		await collect(ctx, tx, {});
	});
});
const take = () => h.run((ctx, tx) => claim(ctx, tx, {}), { now: secondsAfter(20) });
const observation = (state: string, pendingPermissions: unknown[] = [], sessionId = "session") =>
	h.read((tx) =>
		tx.execute(
			sql`INSERT INTO agent_harness_observations (attempt_id,snapshot,updated_at) VALUES (${attemptId},${JSON.stringify({ state, pendingPermissions, sessionId })}::jsonb,${NOW}) ON CONFLICT (attempt_id) DO UPDATE SET snapshot=EXCLUDED.snapshot`,
		),
	);
const receipt = (messageId: string, id = attemptId) =>
	h.read((tx) =>
		tx.execute(
			sql`INSERT INTO agent_harness_receipts (attempt_id,message_id,observed_at) VALUES (${id},${messageId},${NOW})`,
		),
	);

test("native dispatch waits for the current conversation to become idle without permissions", async () => {
	expect(await take()).toBeNull();
	for (const state of ["working", "needs_input", "unknown", "failed"]) {
		await observation(state);
		expect(await take()).toBeNull();
	}
	await observation("idle", [{ requestId: "permission" }]);
	expect(await take()).toBeNull();
	await observation("idle", [], "another-session");
	expect(await take()).toBeNull();
	await observation("idle");
	expect(await take()).toMatchObject({ state: "sending", terminalId: attemptId });
});

test("a durable late receipt clears unknown after host recovery without another send", async () => {
	await observation("ready");
	const delivery = (await take())!;
	await h.run((ctx, tx) => recover(ctx, tx, {}));
	await h.run((ctx, tx) => reconcile(ctx, tx));
	expect((await h.one(sql`SELECT state FROM manager_dispatches`)).state).toBe("unknown");
	await receipt(dispatchMessageId(delivery));
	await h.run((ctx, tx) => reconcile(ctx, tx));
	expect(await h.one(sql`SELECT state,generation,error FROM manager_dispatches`)).toMatchObject({
		state: "sent",
		generation: delivery.generation,
		error: null,
	});
	expect(await take()).toBeNull();
});

test("an old dispatch generation receipt cannot confirm an explicit retry", async () => {
	await observation("idle");
	const first = (await take())!;
	await h.run((ctx, tx) =>
		complete(ctx, tx, { id: first.id, generation: first.generation, state: "unknown", error: "lost" }),
	);
	await h.run((ctx, tx) => retry(ctx, tx, { id: first.id }));
	const second = (await take())!;
	await h.run((ctx, tx) =>
		complete(ctx, tx, { id: second.id, generation: second.generation, state: "unknown", error: "lost again" }),
	);
	await receipt(dispatchMessageId(first));
	await h.run((ctx, tx) => reconcile(ctx, tx));
	expect((await h.one(sql`SELECT state FROM manager_dispatches`)).state).toBe("unknown");
	await receipt(dispatchMessageId(second));
	await h.run((ctx, tx) => reconcile(ctx, tx));
	expect((await h.one(sql`SELECT state FROM manager_dispatches`)).state).toBe("sent");
});

test("a receipt from a different attempt cannot confirm the dispatch", async () => {
	await observation("idle");
	const delivery = (await take())!;
	await h.run((ctx, tx) =>
		complete(ctx, tx, { id: delivery.id, generation: delivery.generation, state: "unknown", error: "lost" }),
	);
	const other = await h.run((ctx, tx) => reserveAttempt(ctx, tx, { runId: "manager" }));
	await receipt(dispatchMessageId(delivery), other.id);
	await h.run((ctx, tx) => reconcile(ctx, tx));
	expect((await h.one(sql`SELECT state FROM manager_dispatches`)).state).toBe("unknown");
});

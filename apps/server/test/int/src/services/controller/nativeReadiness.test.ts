import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { reserveAttempt } from "../../../../../src/services/assignments/attempts.ts";
import { collect } from "../../../../../src/services/controller/collect.ts";
import { claim, complete, recover, retry } from "../../../../../src/services/controller/controller.ts";
import { dispatchMessageId } from "../../../../../src/services/controller/messageId.ts";
import { reconcile } from "../../../../../src/services/controller/reconcile.ts";
import { seedActors, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedActivity, seedTicket } from "../../../../fixtures/tickets.ts";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let projectId: string;
let attemptId: string;
let sessions: ReturnType<typeof controllerSession>[];
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	sessions = [];
	await h.run(async (ctx, tx) => {
		projectId = await seedRoot(tx, "NRD", {
			manager_config: { personaId: "persona", ade: "native", harness: { preset: "claude" } },
		});
		const statusId = await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
		const ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId });
		await seedActors(tx);
		await tx.execute(
			sql`INSERT INTO agent_runs (id,name,runtime,persona_name,kind,instruction,project_id,project_path,session_id,created_at,updated_at) VALUES ('manager','Manager','native','Manager','manager','',${projectId},'NRD','session',${NOW},${NOW})`,
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
		await collect(ctx, tx, { sessions });
	});
});
const take = () => h.run((ctx, tx) => claim(ctx, tx, { sessions }), { now: secondsAfter(20) });
const observation = (state: "ready" | "working" | "idle") => {
	sessions = [controllerSession(attemptId, { activity: { state, updatedAt: NOW.toISOString() } })];
};
const receipt = (messageId: string, id = attemptId) => {
	let session = sessions.find((item) => item.id === id);
	if (!session) {
		session = controllerSession(id);
		sessions.push(session);
	}
	session.acknowledgedMessageIds.push(messageId);
};

test("dispatch requires a live controllable PTY with its initial prompt receipt", async () => {
	expect(await take()).toBeNull();
	for (const overrides of [
		{ status: "exited" as const },
		{ status: "unknown" as const },
		{ controllable: false },
		{ acknowledgedMessageIds: [] },
		{ mode: "stdio" as const },
		{ id: "another-attempt" },
	]) {
		sessions = [controllerSession(attemptId, overrides)];
		expect(await take()).toBeNull();
	}
	observation("working");
	expect(await take()).toMatchObject({ state: "sending", terminalId: attemptId });
});

test.each(["ready", "working", "idle", null] as const)("dispatch accepts runtime activity %s", async (state) => {
	sessions = [controllerSession(attemptId, { activity: state ? { state, updatedAt: NOW.toISOString() } : null })];
	expect(await take()).toMatchObject({ state: "sending", terminalId: attemptId });
});

test("a durable late receipt clears unknown after host recovery without another send", async () => {
	await observation("ready");
	const delivery = (await take())!;
	await h.run((ctx, tx) => recover(ctx, tx, {}));
	await h.run((ctx, tx) => reconcile(ctx, tx, { sessions }));
	expect((await h.one(sql`SELECT state FROM manager_dispatches`)).state).toBe("unknown");
	await receipt(dispatchMessageId(delivery));
	await h.run((ctx, tx) => reconcile(ctx, tx, { sessions }));
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
	await h.run((ctx, tx) => reconcile(ctx, tx, { sessions }));
	expect((await h.one(sql`SELECT state FROM manager_dispatches`)).state).toBe("unknown");
	await receipt(dispatchMessageId(second));
	await h.run((ctx, tx) => reconcile(ctx, tx, { sessions }));
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
	await h.run((ctx, tx) => reconcile(ctx, tx, { sessions }));
	expect((await h.one(sql`SELECT state FROM manager_dispatches`)).state).toBe("unknown");
});

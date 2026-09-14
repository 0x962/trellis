import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { collect } from "../../../../../src/services/controller/collect.ts";
import { claim, complete, recover, resolveUnknown, retry } from "../../../../../src/services/controller/controller.ts";
import { dispatch } from "../../../../../src/services/controller/dispatch.ts";
import { seedActor, seedActors, seedChild, seedRoot, seedStatus } from "../../../../fixtures/projects.ts";
import { seedActivity, seedTicket } from "../../../../fixtures/tickets.ts";
import { testCtx } from "../../../../helpers/ctx.ts";
import { freshHome } from "../../../../helpers/home.ts";
import { type Harness, NOW, secondsAfter, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let projectId: string;
let ticketId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		projectId = await seedRoot(tx, "CTL", {
			manager_config: { personaId: "01M2GHTTXSHPZDFTJQW1MC28N2", concurrency: 3, directory: "" },
		});
		const statusId = await seedStatus(tx, { projectId, name: "Todo", category: "todo", position: 0, isDefault: true });
		ticketId = await seedTicket(tx, { projectId, rootId: projectId, statusId });
		await seedActors(tx);
		await seedActor(tx, { kind: "agent", name: "manager-run" });
		await seedActor(tx, { kind: "agent", name: "01M2GJ634MAAPPB8JDZVDYWX3B" });
		await tx.execute(sql`INSERT INTO agent_runs (id, name, persona_name, kind, instruction, project_id, project_path, state, terminal_id, session_id, created_at, updated_at)
			VALUES ('manager-run', 'Manager', 'Manager', 'manager', 'Manage.', ${projectId}, 'CTL', 'running', 'terminal-1', 'session-1', ${NOW}, ${NOW})`);
	});
});
const event = (name = "dana", seconds = 0) =>
	h.read((tx) =>
		seedActivity(tx, {
			projectId,
			rootId: projectId,
			ticketId,
			actor: { name, kind: name === "dana" ? "human" : "agent" },
			createdAt: secondsAfter(seconds),
		}),
	);
const gather = (seconds = 0) => h.run((ctx, tx) => collect(ctx, tx, {}), { now: secondsAfter(seconds) });
const take = (seconds = 10) => h.run((ctx, tx) => claim(ctx, tx, {}), { now: secondsAfter(seconds) });

test("activity survives a stopped manager and a later controller instance", async () => {
	await h.rows(sql`UPDATE agent_runs SET state = 'stopped'`);
	await event();
	await gather();
	expect(await take()).toBeNull();
	await h.rows(sql`UPDATE agent_runs SET state = 'running'`);
	const delivery = await take(12);
	expect(delivery).toMatchObject({ projectId, runId: "manager-run", terminalId: "terminal-1", state: "sending" });
	expect(delivery!.events).toHaveLength(1);
	expect(await take(13)).toBeNull();
});

test("ULID worker activity wakes the manager but its own activity does not", async () => {
	await event("manager-run");
	await gather();
	expect(await take()).toBeNull();
	await event("01M2GJ634MAAPPB8JDZVDYWX3B");
	await gather();
	expect((await take())!.events).toHaveLength(1);
});

test("continuous activity cannot move the first event deadline", async () => {
	await event();
	await gather();
	await event("dana", 9);
	await gather(9);
	expect(await take(9)).toBeNull();
	expect((await take(10))!.events).toHaveLength(2);
});

test("a restart marks an interrupted send unknown and rejects its late completion", async () => {
	await event();
	await gather();
	const delivery = (await take())!;
	await h.run((ctx, tx) => recover(ctx, tx, {}));
	await h.run((ctx, tx) =>
		complete(ctx, tx, { id: delivery.id, generation: delivery.generation, state: "sent", error: null }),
	);
	await event("dana", 20);
	await gather(20);
	expect(await take(40)).toBeNull();
	expect((await h.one(sql`SELECT state FROM manager_dispatches WHERE id = ${delivery.id}`)).state).toBe("unknown");
	await h.run((ctx, tx) => retry(ctx, tx, { id: delivery.id }));
	const next = (await take(40))!;
	expect(next.id).toBe(delivery.id);
	expect(next.generation).toBeGreaterThan(delivery.generation);
});

test("a sent batch cannot repeat and subsequent events produce a new batch", async () => {
	await event();
	await gather();
	const first = (await take())!;
	await h.run((ctx, tx) =>
		complete(ctx, tx, { id: first.id, generation: first.generation, state: "sent", error: null }),
	);
	await gather(20);
	expect(await take(30)).toBeNull();
	await event("dana", 30);
	await gather(30);
	expect((await take(40))!.id).not.toBe(first.id);
});

test("a project without a manager persona never receives a controller batch", async () => {
	await h.rows(sql`UPDATE projects SET manager_config = '{}'::jsonb`);
	await event();
	await gather();
	expect(await take()).toBeNull();
});

test("the controller waits until a legacy manager stops", async () => {
	await h.rows(sql`INSERT INTO agent_sessions (id, project_id, role, runner, state, name, title, created_at, updated_at)
		VALUES ('legacy', ${projectId}, 'manager', 'superset', 'running', 'Legacy', 'Legacy', ${NOW}, ${NOW})`);
	await event();
	await gather();
	expect(await take()).toBeNull();
	await h.rows(sql`UPDATE agent_sessions SET state = 'stopped'`);
	expect(await take()).not.toBeNull();
});

test("a rollback preserves the activity cursor and creates no dispatch", async () => {
	await event();
	await expect(
		h.run(async (ctx, tx) => {
			await collect(ctx, tx, {});
			throw new Error("rollback");
		}),
	).rejects.toThrow("rollback");
	expect(await h.rows(sql`SELECT * FROM manager_dispatches`)).toHaveLength(0);
	await gather();
	expect((await take())!.events).toHaveLength(1);
});

test("a child with its own manager owns its ticket events", async () => {
	const childId = await h.read((tx) =>
		seedChild(tx, projectId, projectId, "child", { manager_config: { personaId: "child-manager" } }),
	);
	await h.read((tx) => seedActivity(tx, { rootId: projectId, projectId: childId, ticketId, createdAt: NOW }));
	await gather();
	expect(await take()).toBeNull();
	expect(await h.rows(sql`SELECT project_id FROM manager_dispatches`)).toEqual([{ project_id: childId }]);
});

test("explicit confirmation unblocks the next batch without a resend", async () => {
	await event();
	await gather();
	const first = (await take())!;
	await h.run((ctx, tx) =>
		complete(ctx, tx, { id: first.id, generation: first.generation, state: "unknown", error: "Connection closed" }),
	);
	await event("dana", 30);
	await h.run((ctx, tx) => resolveUnknown(ctx, tx, { id: first.id }));
	await gather(30);
	expect((await take(40))!.id).not.toBe(first.id);
});

test("a transport failure records unknown once and never automatically resends", async () => {
	const home = freshHome();
	const bin = join(home, "send.ts");
	writeFileSync(
		bin,
		'#!/usr/bin/env bun\nimport { appendFileSync } from "node:fs";\nappendFileSync(import.meta.dir + "/calls.txt", "send\\n");\nprocess.stderr.write("connection closed after write");\nprocess.exit(1);\n',
	);
	chmodSync(bin, 0o755);
	await h.rows(sql`UPDATE agent_runs SET workspace_id = 'workspace-1'`);
	await event();
	await gather();
	const { ctx } = testCtx({ db: h.db, home, now: () => secondsAfter(10) });
	await dispatch({ ...ctx, supersetBin: bin, publicUrl: "http://127.0.0.1:4521" });
	expect(await h.one(sql`SELECT state, error FROM manager_dispatches`)).toMatchObject({
		state: "unknown",
		error: expect.stringContaining("connection closed after write"),
	});
	expect(readFileSync(join(home, "calls.txt"), "utf8")).toBe("send\n");
	await dispatch({ ...ctx, supersetBin: bin, publicUrl: "http://127.0.0.1:4521" });
	expect(readFileSync(join(home, "calls.txt"), "utf8")).toBe("send\n");
});

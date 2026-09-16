import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { create, update } from "../../../../../src/services/comments.ts";
import { seedProject, seedTicket } from "../../../../fixtures";
import { serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Awaited<ReturnType<typeof serviceHarness>>;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
const seed = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
	const other = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
	for (const [id, persona, kind, target, closed] of [
		["537", "Builder", "builder", ticket, false],
		["538", "Builder", "builder", other, false],
		["539", "Trellis", "manager", null, false],
		["540", "Builder", "builder", ticket, true],
		["541", "Code separation", "reviewer", ticket, false],
	] as const)
		await h.db.execute(sql`INSERT INTO agent_runs (id,name,persona_name,kind,instruction,project_id,project_path,ticket_id,terminal_id,session_id,closed_at,created_at,updated_at)
	VALUES (${id},'Random name',${persona},${kind},'Work',${rootId},'APP',${target},${`terminal-${id}`},${`session-${id}`},${closed ? new Date() : null},now(),now())`);
	await h.rebuild();
	return ticket;
};

test("persona mentions capture only the ticket assignments and its project manager", async () => {
	const ticket = await seed();
	const comment = await h.run((ctx, tx) =>
		create(ctx, tx, {
			ticket,
			body: "@builder please fix this. @Trellis coordinate. @Code separation review. @builder",
		}),
	);
	const deliveries = await h.rows(
		sql`SELECT run_id, terminal_id, session_id FROM comment_deliveries WHERE comment_id=${comment.id} ORDER BY run_id`,
	);
	expect(deliveries).toEqual([
		{ run_id: "537", terminal_id: "terminal-537", session_id: "session-537" },
		{ run_id: "539", terminal_id: "terminal-539", session_id: "session-539" },
		{ run_id: "541", terminal_id: "terminal-541", session_id: "session-541" },
	]);
});

test("an edit queues only new mentions and keeps the original recipients", async () => {
	const ticket = await seed();
	const comment = await h.run((ctx, tx) => create(ctx, tx, { ticket, body: "@builder fix this" }));
	await h.rows(sql`UPDATE agent_runs SET closed_at=now() WHERE id='537'`);
	await h.rows(sql`UPDATE agent_runs SET ticket_id=${ticket} WHERE id='538'`);
	await h.run((ctx, tx) => update(ctx, tx, { id: comment.id, body: "@builder fix this. @Trellis check it." }));
	expect((await h.rows(sql`SELECT run_id FROM comment_deliveries ORDER BY run_id`)).map((row) => row.run_id)).toEqual([
		"537",
		"539",
	]);
});

test("email addresses, code, and longer names do not notify agents", async () => {
	const ticket = await seed();
	await h.run((ctx, tx) =>
		create(ctx, tx, { ticket, body: "me@builder.com @builder-extra `@builder`\n```\n@Trellis\n```" }),
	);
	expect(await h.rows(sql`SELECT id FROM comment_deliveries`)).toHaveLength(0);
});

test("a mention queues a persona that has no ticket assignment", async () => {
	const ticket = await seed();
	const personaId = ulid();
	await h.db.execute(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
		VALUES (${personaId},'Release Builder','builder','Ship the change.',now(),now())`);
	const comment = await h.run((ctx, tx) => create(ctx, tx, { ticket, body: "@Release Builder ship this." }));
	expect(comment.notifications).toEqual([
		{
			runId: null,
			personaName: "Release Builder",
			state: "pending",
			error: null,
		},
	]);
	expect(
		await h.rows(
			sql`SELECT persona_id,run_id,state FROM comment_deliveries WHERE comment_id=${comment.id} ORDER BY id`,
		),
	).toEqual([{ persona_id: personaId, run_id: null, state: "pending" }]);
});

test("an edit queues a new persona mention that has no ticket assignment", async () => {
	const ticket = await seed();
	const personaId = ulid();
	await h.db.execute(sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at)
		VALUES (${personaId},'Release Builder','builder','Ship the change.',now(),now())`);
	const comment = await h.run((ctx, tx) => create(ctx, tx, { ticket, body: "Ship this." }));
	await h.run((ctx, tx) => update(ctx, tx, { id: comment.id, body: "@Release Builder ship this." }));
	expect(
		await h.rows(sql`SELECT persona_id,run_id,state FROM comment_deliveries WHERE comment_id=${comment.id}`),
	).toEqual([{ persona_id: personaId, run_id: null, state: "pending" }]);
});

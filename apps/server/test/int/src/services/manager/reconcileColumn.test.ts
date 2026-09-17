import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { HarnessSchema } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { columnStates } from "../../../../../src/services/manager/columnState.ts";
import { reconcileColumn } from "../../../../../src/services/manager/reconcileColumn.ts";
import { reserveColumnWorker } from "../../../../../src/services/manager/reserveColumnWorker.ts";
import type { IoCtx } from "../../../../../src/services/support.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { testCtx } from "../../../../helpers/ctx.ts";
import { type Harness, NOW, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let project: string;
let status: string;
let ticket: string;
let personaId: string;
let calls: string[];
let starts: NonNullable<Parameters<typeof reconcileColumn>[3]>["start"] extends (...args: infer A) => unknown
	? A[1][]
	: never;
const ctx = (): IoCtx => ({
	...testCtx({ db: h.db, home: "/unused", now: () => NOW }).ctx,
	core: h.ctx(() => {}),
	localUrl: "http://trellis.test",
	publicUrl: "http://trellis.test",
});
const state = async () => (await h.read((tx) => columnStates(tx, ticket)))[0]!;
const deps = () => ({
	workspaceExists: async () => true,
	stop: async (_ctx: unknown, run: { id: string }) => {
		calls.push("stop");
		return { id: run.id };
	},
	start: async (_ctx: unknown, input: (typeof starts)[number]) => {
		calls.push("start");
		starts.push(input);
		return { id: input.run.id };
	},
	send: async () => {
		calls.push("send");
		return { id: "sent" };
	},
	preset: async () => "claude" as const,
	list: async () => [] as RuntimeProcessStatus[],
});
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	calls = [];
	starts = [];
	await h.read(async (tx) => {
		await seedActors(tx);
		project = await seedRoot(tx, "COL", { manager_config: { personaId: null, directory: "/repository" } });
		const statuses = await seedStatuses(tx, project);
		status = statuses.agentReview;
		personaId = ulid();
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES (${personaId},'Reviewer','reviewer','Review.',${NOW},${NOW})`,
		);
		await tx.execute(
			sql`UPDATE statuses SET agent_config=${JSON.stringify({ personaId, harness: HarnessSchema.parse({ preset: "claude" }), accountId: null })}::jsonb,wip_limit=1 WHERE id=${status}`,
		);
		ticket = await seedTicket(tx, { projectId: project, rootId: project, statusId: status });
	});
	await h.rebuild();
});

const start = async () => {
	await reconcileColumn(ctx(), await state(), [], deps());
	return starts[0]!;
};
const sessionFor = (input: Awaited<ReturnType<typeof start>>, patch: Partial<RuntimeProcessStatus> = {}) =>
	controllerSession(input.attempt.id, {
		agent: { sessionId: "saved-conversation", outcome: null, error: null } as NonNullable<
			RuntimeProcessStatus["agent"]
		>,
		activity: { state: "working", updatedAt: NOW.toISOString() },
		...patch,
	});

test("a reviewer starts automatically and does not need a project manager", async () => {
	const launched = await start();
	expect(launched.run.kind).toBe("reviewer");
	expect(launched.requiredStatusId).toBe(status);
});
test("all existing tickets start above the column limit", async () => {
	const second = await h.read((tx) => seedTicket(tx, { projectId: project, rootId: project, statusId: status }));
	await start();
	await reconcileColumn(ctx(), (await h.read((tx) => columnStates(tx, second)))[0]!, [], deps());
	expect(starts).toHaveLength(2);
});
test("a failed live process stops before the next attempt", async () => {
	const launched = await start();
	calls = [];
	await reconcileColumn(
		ctx(),
		await state(),
		[
			sessionFor(launched, {
				agent: { sessionId: "saved", outcome: "failed", error: "quota" } as NonNullable<RuntimeProcessStatus["agent"]>,
			}),
		],
		deps(),
	);
	expect(calls).toEqual(["stop", "start"]);
	expect(starts[1]!.resume).toBe(true);
});
test("the next beat restarts a failed attempt with unchanged settings", async () => {
	const launched = await start();
	const failed = (input: typeof launched) => sessionFor(input, { status: "exited" });
	await reconcileColumn(ctx(), await state(), [failed(launched)], deps());
	await reconcileColumn(ctx(), await state(), [failed(starts[1]!)], deps());
	expect(starts).toHaveLength(3);
});
test("a healthy worker keeps its settings after the column changes", async () => {
	const launched = await start();
	await h.rows(
		sql`UPDATE statuses SET agent_config=jsonb_set(agent_config,'{harness}',${JSON.stringify(HarnessSchema.parse({ preset: "codex" }))}::jsonb) WHERE id=${status}`,
	);
	await reconcileColumn(ctx(), await state(), [sessionFor(launched)], deps());
	expect(starts).toHaveLength(1);
});
test("a restart uses the latest harness and preserves the workspace", async () => {
	const launched = await start();
	await h.rows(sql`UPDATE agent_runs SET workspace_id='/saved/work' WHERE id=${launched.run.id}`);
	await h.rows(
		sql`UPDATE statuses SET agent_config=jsonb_set(agent_config,'{harness}',${JSON.stringify(HarnessSchema.parse({ preset: "codex", model: "openai/gpt-5.6-sol", effort: "high" }))}::jsonb) WHERE id=${status}`,
	);
	await reconcileColumn(ctx(), await state(), [sessionFor(launched, { status: "exited" })], deps());
	expect(starts[1]!.config.harness).toMatchObject({ preset: "codex", model: "openai/gpt-5.6-sol", effort: "high" });
	expect(starts[1]!.run.workspaceId).toBe("/saved/work");
	expect(starts[1]!.resume).toBe(false);
});
test("unknown ownership never creates another worker", async () => {
	const launched = await start();
	await expect(
		reconcileColumn(ctx(), await state(), [sessionFor(launched, { status: "unknown" })], deps()),
	).rejects.toThrow("ownership");
	expect(starts).toHaveLength(1);
});
test("a move to a manual column stops the previous worker", async () => {
	const launched = await start();
	await h.rows(
		sql`UPDATE tickets SET status_id=(SELECT id FROM statuses WHERE project_id=${project} AND category='todo') WHERE id=${ticket}`,
	);
	calls = [];
	await reconcileColumn(ctx(), await state(), [sessionFor(launched)], deps());
	expect(calls).toEqual(["stop"]);
	expect(await h.rows(sql`SELECT retired FROM column_workers`)).toEqual([{ retired: true }]);
});
test("a stale reservation cannot launch after a column move", async () => {
	const before = await state();
	await h.rows(
		sql`UPDATE tickets SET status_id=(SELECT id FROM statuses WHERE project_id=${project} AND category='todo') WHERE id=${ticket}`,
	);
	expect(await h.run((core, tx) => reserveColumnWorker(core, tx, before))).toBeNull();
});
test("two reservations for one snapshot create one worker", async () => {
	const before = await state();
	await h.run((core, tx) => reserveColumnWorker(core, tx, before));
	expect(await h.run((core, tx) => reserveColumnWorker(core, tx, before))).toBeNull();
});
test("a ticket can leave and return to the same automated column", async () => {
	const launched = await start();
	await h.rows(
		sql`UPDATE tickets SET status_id=(SELECT id FROM statuses WHERE project_id=${project} AND category='todo') WHERE id=${ticket}`,
	);
	await reconcileColumn(ctx(), await state(), [sessionFor(launched)], deps());
	await h.rows(sql`UPDATE tickets SET status_id=${status} WHERE id=${ticket}`);
	await reconcileColumn(ctx(), await state(), [sessionFor(launched, { status: "exited" })], deps());
	expect(starts).toHaveLength(2);
});
test.each(["todo", "done"])("a configured %s column starts its worker", async (category) => {
	await h.rows(
		sql`UPDATE statuses SET agent_config=(SELECT agent_config FROM statuses WHERE id=${status}) WHERE project_id=${project} AND category=${category}`,
	);
	await h.rows(
		sql`UPDATE tickets SET status_id=(SELECT id FROM statuses WHERE project_id=${project} AND category=${category}),completed_at=${category === "done" ? NOW : null} WHERE id=${ticket}`,
	);
	await reconcileColumn(ctx(), await state(), [], deps());
	expect(starts).toHaveLength(1);
});
test("a stopped worker from before column management keeps its workspace", async () => {
	const first = await start();
	await h.rows(sql`DELETE FROM column_workers WHERE ticket_id=${ticket}`);
	await h.rows(sql`UPDATE agent_runs SET workspace_id='/saved/uncommitted',closed_at=${NOW} WHERE id=${first.run.id}`);
	await reconcileColumn(ctx(), await state(), [sessionFor(first, { status: "exited" })], deps());
	expect(starts[1]!.run.workspaceId).toBe("/saved/uncommitted");
});
test("a transition stops an existing worker before the first manager beat", async () => {
	const first = await start();
	await h.rows(sql`DELETE FROM column_workers WHERE ticket_id=${ticket}`);
	const { move } = await import("../../../../../src/services/tickets/move.ts");
	await h.run((core, tx) => move(core, tx, { ticket, status: "todo" }));
	calls = [];
	await reconcileColumn(ctx(), await state(), [sessionFor(first)], deps());
	expect(calls).toEqual(["stop"]);
});
test("a missing workspace starts a replacement with its previous history", async () => {
	const first = await start();
	await h.rows(sql`UPDATE agent_runs SET workspace_id='/deleted/work' WHERE id=${first.run.id}`);
	await reconcileColumn(ctx(), await state(), [sessionFor(first, { status: "exited" })], {
		...deps(),
		workspaceExists: async () => false,
	});
	expect(starts[1]!.run.workspaceId).toBeNull();
	expect(starts[1]!.resume).toBe(false);
	expect(starts[1]!.context).toContain('"previousWorkspaceMissing":true');
});
test("an idle worker receives a valid continuation once per interval", async () => {
	const first = await start();
	const idle = sessionFor(first, { activity: { state: "idle", updatedAt: NOW.toISOString() } });
	const messages: string[] = [];
	const transport = {
		...deps(),
		send: async (_ctx: unknown, input: { messageId?: string }) => {
			expect(input.messageId).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
			messages.push(input.messageId!);
			return { id: first.run.id };
		},
	};
	await reconcileColumn(ctx(), await state(), [idle], transport);
	await reconcileColumn(ctx(), await state(), [idle], transport);
	expect(messages).toHaveLength(1);
});

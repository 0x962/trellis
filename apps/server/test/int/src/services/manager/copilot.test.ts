import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { reconcileCopilot } from "../../../../../src/services/manager/copilot.ts";
import type { IoCtx } from "../../../../../src/services/support.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { controllerSession } from "../../../../helpers/controllerSession.ts";
import { testCtx } from "../../../../helpers/ctx.ts";
import { type Harness, NOW, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let project: string;
let calls: string[];
type Start = Parameters<NonNullable<Parameters<typeof reconcileCopilot>[3]>["start"]>[1];
let starts: Start[];
const ctx = (): IoCtx => ({
	...testCtx({ db: h.db, home: "/unused", now: () => NOW }).ctx,
	core: h.ctx(() => {}),
	localUrl: "http://trellis.test",
	publicUrl: "http://trellis.test",
});
const deps = () => ({
	start: async (_ctx: unknown, input: Start) => {
		calls.push("start");
		starts.push(input);
		return { id: input.run.id };
	},
	stop: async (_ctx: unknown, run: { id: string }) => {
		calls.push("stop");
		return { id: run.id };
	},
	preset: async () => "claude" as const,
	list: async () => [] as RuntimeProcessStatus[],
	mkdir: (async () => undefined) as typeof import("node:fs/promises").mkdir,
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
		const personaId = ulid();
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES (${personaId},'Copilot','manager','Act only on user requests.',${NOW},${NOW})`,
		);
		project = await seedRoot(tx, "COP", {
			manager_config: { personaId, directory: "/project", harness: { preset: "claude" } },
		});
		await seedStatuses(tx, project);
	});
	await h.rebuild();
});
test("a project copilot starts without a human start command", async () => {
	await reconcileCopilot(ctx(), project, [], deps());
	expect(starts).toHaveLength(1);
	expect(starts[0]!.run.kind).toBe("manager");
});
test("an idle copilot receives no automatic work", async () => {
	await reconcileCopilot(ctx(), project, [], deps());
	const session = controllerSession(starts[0]!.attempt.id, {
		activity: { state: "idle", updatedAt: NOW.toISOString() },
	});
	calls = [];
	await reconcileCopilot(ctx(), project, [session], deps());
	expect(calls).toEqual([]);
});
test("copilot recovery resumes its saved conversation", async () => {
	await reconcileCopilot(ctx(), project, [], deps());
	const first = starts[0]!;
	await h.rows(sql`UPDATE agent_runs SET workspace_id='/saved',session_id='conversation' WHERE id=${first.run.id}`);
	const session = controllerSession(first.attempt.id, {
		status: "exited",
		agent: { sessionId: "conversation" } as NonNullable<RuntimeProcessStatus["agent"]>,
	});
	await reconcileCopilot(ctx(), project, [session], deps());
	expect(starts[1]!.resume).toBe(true);
	expect(starts[1]!.run.id).toBe(first.run.id);
});
test("copilot recovery applies a new harness after quota failure", async () => {
	await reconcileCopilot(ctx(), project, [], deps());
	const first = starts[0]!;
	await h.rows(
		sql`UPDATE projects SET manager_config=jsonb_set(manager_config,'{harness}','{"preset":"codex"}') WHERE id=${project}`,
	);
	const session = controllerSession(first.attempt.id, {
		agent: { sessionId: "conversation", error: "quota", outcome: "failed" } as NonNullable<
			RuntimeProcessStatus["agent"]
		>,
	});
	calls = [];
	await reconcileCopilot(ctx(), project, [session], deps());
	expect(calls).toEqual(["stop", "start"]);
	expect(starts[1]!.resume).toBe(false);
	expect(starts[1]!.config.harness.preset).toBe("codex");
});
test("every beat retries a copilot that failed before process creation", async () => {
	await reconcileCopilot(ctx(), project, [], deps());
	const failure = () =>
		h.rows(
			sql`UPDATE agent_runs SET terminal_id=NULL,closed_at=${NOW},updated_at=${NOW},error='Quota' WHERE project_id=${project}`,
		);
	await failure();
	await reconcileCopilot(ctx(), project, [], deps());
	await failure();
	await reconcileCopilot(ctx(), project, [], deps());
	expect(starts).toHaveLength(3);
});
test("a project inherits the copilot persona and uses its own harness", async () => {
	const { seedChild } = await import("../../../../fixtures/projects.ts");
	const child = await h.read((tx) =>
		seedChild(tx, project, project, "child", {
			manager_config: { personaId: null, directory: "", harness: { preset: "codex" } },
		}),
	);
	await h.rebuild();
	await reconcileCopilot(ctx(), child, [], deps());
	expect(starts[0]!.config.harness.preset).toBe("codex");
	expect(starts[0]!.run.personaName).toBe("Copilot");
});

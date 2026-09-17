import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { HarnessSchema, ProjectManagerConfigSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { reserve } from "../../../../../src/services/agentRuns/reserve.ts";
import { projectLaunchConfig } from "../../../../../src/services/projectLaunchConfig/projectLaunchConfig.ts";
import { seedActors, seedChild, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let root: string;
let child: string;
let ticket: string;
const personaId = ulid();
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		root = await seedRoot(tx, "ROOT");
		const statuses = await seedStatuses(tx, root);
		child = await seedChild(tx, root, root, "child");
		ticket = await seedTicket(tx, { projectId: child, rootId: root, statusId: statuses.started });
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES (${personaId},'Builder','builder','Build.',now(),now())`,
		);
	});
	await h.rebuild();
});

test("builder defaults keep their persona and harness separate from the manager", () => {
	const config = ProjectManagerConfigSchema.parse({
		personaId: null,
		directory: "",
		builder: { personaId, harness: { preset: "codex", model: "openai/gpt-5.6-sol" } },
	});
	expect(config.builder?.personaId).toBe(personaId);
	expect(config.builder?.harness.preset).toBe("codex");
	expect(config.harness.preset).toBe("claude");
});

test("a worker uses its column defaults and a request can override the harness", async () => {
	await h.rows(
		sql`UPDATE projects SET manager_config=manager_config || ${JSON.stringify({ builder: { personaId, harness: { preset: "codex", model: "openai/gpt-5.6-sol" } } })}::jsonb WHERE id=${root}`,
	);
	await h.rows(
		sql`UPDATE statuses SET agent_config=${JSON.stringify({ personaId, harness: HarnessSchema.parse({ preset: "codex", model: "openai/gpt-5.6-sol" }), accountId: null })}::jsonb WHERE id=(SELECT status_id FROM tickets WHERE id=${ticket})`,
	);
	const inherited = await h.read((tx) => projectLaunchConfig(tx, { projectId: child }));
	expect(inherited.builder?.personaId).toBe(personaId);
	const run = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId }));
	if (run.replay) throw new Error("Expected a new reservation");
	expect(run.config.harness.preset).toBe("codex");
	await h.rows(sql`UPDATE agent_runs SET closed_at=now() WHERE id=${run.run.id}`);
	const override = await h.run((ctx, tx) =>
		reserve(ctx, tx, {
			ticket,
			personaId,
			harness: HarnessSchema.parse({ preset: "claude", model: "anthropic/claude-sonnet-5" }),
		}),
	);
	if (override.replay) throw new Error("Expected a new reservation");
	expect(override.config.harness.preset).toBe("claude");
	expect(override.config.harness.model).toBe("anthropic/claude-sonnet-5");
});

test("a saved builder restart cannot bypass Todo", async () => {
	const run = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId }));
	if (run.replay) throw new Error("Expected a new reservation");
	await h.rows(
		sql`UPDATE tickets SET status_id=(SELECT id FROM statuses WHERE project_id=${root} AND category='todo') WHERE id=${ticket}`,
	);
	const { reserveResume } = await import("../../../../../src/services/agentRuns/reserveResume.ts");
	const restart = await h.run((ctx, tx) =>
		reserveResume(
			ctx,
			tx,
			{
				runId: run.run.id,
				previousAttemptId: run.attempt.id,
				attempt: { id: "next-attempt", token: "next-token" },
				providerSessionId: "saved-session",
				workspace: "/tmp/saved-workspace",
				harness: "claude",
			},
			false,
		),
	);
	expect(restart).toBeNull();
});

test("a model override clears the effort selected for another model", async () => {
	await h.rows(
		sql`UPDATE projects SET manager_config=manager_config || ${JSON.stringify({ builder: { personaId, harness: { preset: "claude", model: "anthropic/claude-opus-4.6", effort: "max" } } })}::jsonb WHERE id=${root}`,
	);
	const run = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId, model: "anthropic/claude-haiku-4.5" }));
	if (run.replay) throw new Error("Expected a new reservation");
	expect(run.config.harness.model).toBe("anthropic/claude-haiku-4.5");
	expect(run.config.harness.effort).toBeUndefined();
});

test("a restart preserves the saved worker effort instead of manager defaults", async () => {
	const run = await h.run((ctx, tx) => reserve(ctx, tx, { ticket, personaId }));
	if (run.replay) throw new Error("Expected a new reservation");
	const { reserveResume } = await import("../../../../../src/services/agentRuns/reserveResume.ts");
	const restart = await h.run((ctx, tx) =>
		reserveResume(
			ctx,
			tx,
			{
				runId: run.run.id,
				previousAttemptId: run.attempt.id,
				attempt: { id: "next-attempt", token: "next-token" },
				providerSessionId: "saved-session",
				workspace: "/tmp/saved-workspace",
				harness: "codex",
				model: "openai/gpt-5.6-sol",
				effort: "ultra",
			},
			false,
		),
	);
	expect(restart?.config.harness.effort).toBe("ultra");
	expect(restart?.config.harness.preset).toBe("codex");
});

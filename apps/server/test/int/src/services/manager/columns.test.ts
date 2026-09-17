import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { StatusUpdateInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { create as createStatus, update as updateStatus } from "../../../../../src/services/statuses.ts";
import { move } from "../../../../../src/services/tickets/move.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let project: string;
let status: string;
let ticket: string;
let personaId: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		project = await seedRoot(tx, "COL");
		const statuses = await seedStatuses(tx, project);
		status = statuses.agentReview;
		ticket = await seedTicket(tx, { projectId: project, rootId: project, statusId: statuses.todo });
		personaId = ulid();
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES (${personaId},'Reviewer','reviewer','Review the ticket.',now(),now())`,
		);
	});
	await h.rebuild();
});

test("a status stores its worker persona and launch settings", async () => {
	const agentConfig = {
		personaId,
		harness: { preset: "claude", model: "anthropic/claude-opus-5", effort: "high" },
		accountId: null,
	};
	const input = StatusUpdateInputSchema.parse({ project, status, agentConfig });
	const updated = await h.run((ctx, tx) => updateStatus(ctx, tx, input));
	expect(updated).toMatchObject({ agentConfig });
});

for (const actor of [
	{ kind: "human", name: "dana" },
	{ kind: "agent", name: "claude" },
	{ kind: "system", name: "trellis" },
] as const) {
	test(`${actor.kind} cannot enter a full column but existing tickets can reorder`, async () => {
		await h.run((ctx, tx) => updateStatus(ctx, tx, { project, status, wipLimit: 1 }));
		const existing = await h.read((tx) => seedTicket(tx, { projectId: project, rootId: project, statusId: status }));
		await expect(h.run((ctx, tx) => move(ctx, tx, { ticket, status }), { actor })).rejects.toMatchObject({
			code: "STATUS_FULL",
		});
		await h.run((ctx, tx) => move(ctx, tx, { ticket: existing, status }), { actor });
	});
}
test("an occupied In Progress column must retain a worker configuration", async () => {
	const started = await h.one<{ id: string }>(
		sql`SELECT id FROM statuses WHERE project_id=${project} AND category='started'`,
	);
	await h.run((ctx, tx) =>
		updateStatus(ctx, tx, {
			project,
			status: started.id,
			agentConfig: { personaId, harness: { preset: "claude" }, accountId: null },
		}),
	);
	await h.read((tx) => seedTicket(tx, { projectId: project, rootId: project, statusId: started.id }));
	await expect(
		h.run((ctx, tx) => updateStatus(ctx, tx, { project, status: started.id, agentConfig: null })),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
});

test.each(["done", "canceled"] as const)("a %s status rejects a worker configuration", async (category) => {
	const terminal = await h.one<{ id: string }>(
		sql`SELECT id FROM statuses WHERE project_id=${project} AND category=${category}`,
	);
	await expect(
		h.run((ctx, tx) =>
			createStatus(ctx, tx, {
				project,
				name: `Another ${category}`,
				category,
				agentConfig: { personaId, harness: { preset: "claude" }, accountId: null },
			}),
		),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(
		h.run((ctx, tx) =>
			updateStatus(ctx, tx, {
				project,
				status: terminal.id,
				agentConfig: { personaId, harness: { preset: "claude" }, accountId: null },
			}),
		),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
});

import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { create } from "../../../../src/services/tickets/create.ts";
import { move } from "../../../../src/services/tickets/move.ts";
import { update } from "../../../../src/services/tickets/update.ts";
import { seedActors, seedRoot, seedStatuses } from "../../../fixtures/projects.ts";
import { seedTicket } from "../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let h: Harness;
let projectId: string;
let ticket: string;
beforeAll(async () => {
	h = await serviceHarness();
});
afterAll(() => h.close());
afterEach(() => h.read(assertStatusInvariant));
beforeEach(async () => {
	await h.reset();
	await h.read(async (tx) => {
		await seedActors(tx);
		projectId = await seedRoot(tx, "GUARD");
		const statuses = await seedStatuses(tx, projectId);
		ticket = await seedTicket(tx, { projectId, rootId: projectId, statusId: statuses.todo });
	});
	await h.rebuild();
});

for (const actor of [
	{ kind: "human", name: "dana" },
	{ kind: "agent", name: "claude" },
	{ kind: "system", name: "trellis" },
] as const) {
	test.each(["create", "move", "update"])(
		`${actor.kind} %s requires a column worker persona for In Progress`,
		async (method) => {
			await expect(
				h.run(
					(ctx, tx) =>
						method === "create"
							? create(ctx, tx, { project: projectId, title: "New work", status: "in-progress" })
							: (method === "move" ? move : update)(ctx, tx, { ticket, status: "in-progress" }),
					{ actor },
				),
			).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
			expect(
				await h.rows(sql`SELECT t.id FROM tickets t JOIN statuses s ON s.id=t.status_id WHERE s.category='started'`),
			).toEqual([]);
		},
	);
}

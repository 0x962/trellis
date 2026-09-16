import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { HarnessSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { update } from "../../../../../src/services/projects.ts";
import { seedActors, seedChild, seedRoot, seedStatuses } from "../../../../fixtures/projects.ts";
import { seedTicket } from "../../../../fixtures/tickets.ts";
import { type Harness, serviceHarness } from "../../../../helpers/services.ts";
import { assertStatusInvariant } from "../../../../invariants.ts";

let h: Harness;
let root: string;
let child: string;
const personaId = ulid();
const config = {
	personaId: null,
	directory: "",
	builder: { personaId, harness: HarnessSchema.parse({ preset: "codex" }) },
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
		await tx.execute(
			sql`INSERT INTO personas (id,name,kind,instruction,created_at,updated_at) VALUES (${personaId},'Builder','builder','Build.',now(),now())`,
		);
		root = await seedRoot(tx, "ROOT", { manager_config: config });
		child = await seedChild(tx, root, root, "child");
		const statuses = await seedStatuses(tx, root);
		await seedTicket(tx, { projectId: child, rootId: root, statusId: statuses.started });
	});
	await h.rebuild();
});

test("a project cannot remove the builder default required by an In Progress child ticket", async () => {
	await expect(
		h.run((ctx, tx) => update(ctx, tx, { project: root, managerConfig: { ...config, builder: null } })),
	).rejects.toThrow("builder");
	expect(
		(await h.one<{ manager_config: typeof config }>(sql`SELECT manager_config FROM projects WHERE id=${root}`))
			.manager_config.builder.personaId,
	).toBe(personaId);
});

test("a parent can clear its default when the In Progress child has its own builder", async () => {
	await h.run((ctx, tx) => update(ctx, tx, { project: child, managerConfig: config }));
	const result = await h.run((ctx, tx) =>
		update(ctx, tx, { project: root, managerConfig: { ...config, builder: null } }),
	);
	expect(result.managerConfig!.builder).toBeNull();
});

test("a configured builder persona cannot be deleted", async () => {
	const personas = await import("../../../../../src/services/personas.ts");
	await expect(h.run((ctx, tx) => personas.remove(ctx, tx, { id: personaId }))).rejects.toThrow("builder");
});

test("a configured builder persona cannot become a reviewer", async () => {
	const personas = await import("../../../../../src/services/personas.ts");
	await expect(
		h.run((ctx, tx) =>
			personas.update(ctx, tx, { id: personaId, name: "Builder", instruction: "Review.", kind: "reviewer" }),
		),
	).rejects.toThrow("builder");
});

test("a project move cannot remove the inherited default from In Progress work", async () => {
	const { move } = await import("../../../../../src/services/projectsMove.ts");
	const branch = await h.read((tx) => seedChild(tx, root, root, "branch", { manager_config: config }));
	await h.rows(sql`UPDATE projects SET parent_id=${branch} WHERE id=${child}`);
	await h.rows(sql`UPDATE projects SET manager_config=manager_config-'builder' WHERE id=${root}`);
	await h.rebuild();
	await expect(h.run((ctx, tx) => move(ctx, tx, { project: child, parent: root }))).rejects.toThrow("builder");
});

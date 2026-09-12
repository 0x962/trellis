import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { StatusUpdateInputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import * as statuses from "../../../../src/services/statuses.ts";
import { seedChild, seedProject, seedTicket } from "../../../fixtures";
import { activityRows, eventsOfType, expectError, type Harness, serviceHarness } from "../../../helpers/services.ts";

// An update edits the owner's row: a rename rewrites the slug and moves no
// ticket, `isDefault` transfers the one default, and the category never
// changes. A status ref through an inheriting project reaches the owner's
// row, so every project that inherits reads the change.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type StatusRow = {
	id: string;
	name: string;
	slug: string;
	category: string;
	reviewer: string | null;
	color: string;
	position: number;
	wip_limit: number | null;
	is_default: boolean;
};

const update = (input: Parameters<typeof statuses.update>[2]) => h.run((ctx, tx) => statuses.update(ctx, tx, input));

const statusRow = (id: string) =>
	h.one<StatusRow>(
		sql`SELECT id, name, slug, category, reviewer, color, position, wip_limit, is_default FROM statuses WHERE id = ${id}`,
	);

const seedCde = async () => {
	const seeded = await seedProject(h.db, "CDE");
	await h.rebuild();
	return { cde: seeded.rootId, statuses: seeded.statuses };
};

describe("statuses.update fields", () => {
	test("a rename rewrites the slug and moves no ticket", async () => {
		const { cde, statuses: root } = await seedCde();
		const ticket = await seedTicket(h.db, { projectId: cde, rootId: cde, statusId: root.started });
		const updated = await update({ project: "CDE", status: "in-progress", name: "Doing" });
		expect(updated.name).toBe("Doing");
		expect(updated.slug).toBe("doing");
		expect(updated.id).toBe(root.started);
		const row = await statusRow(root.started);
		expect(row.name).toBe("Doing");
		expect(row.slug).toBe("doing");
		const found = await h.one<{ status_id: string }>(sql`SELECT status_id FROM tickets WHERE id = ${ticket}`);
		expect(found.status_id).toBe(root.started);
	});

	test("a rename onto another status name throws DUPLICATE", async () => {
		await seedCde();
		const error = await expectError(update({ project: "CDE", status: "in-progress", name: "Todo" }), "DUPLICATE");
		expect(error.data).toEqual({ field: "name" });
	});

	test("a category in an update throws STATUS_CATEGORY_IMMUTABLE", async () => {
		await seedCde();
		const input = { project: "CDE", status: "done", category: "canceled" };
		expect(StatusUpdateInputSchema.safeParse(input).success).toBe(false);
		await expectError(update(input as unknown as Parameters<typeof statuses.update>[2]), "STATUS_CATEGORY_IMMUTABLE");
	});

	test("an update with isDefault transfers the default", async () => {
		const { statuses: root } = await seedCde();
		const before = await statusRow(root.todo);
		const updated = await update({ project: "CDE", status: "in-progress", isDefault: true });
		expect(updated.isDefault).toBe(true);
		expect((await statusRow(root.started)).is_default).toBe(true);
		const after = await statusRow(root.todo);
		expect(after).toEqual({ ...before, is_default: false });
	});

	test("an update clears the wip limit and changes the color", async () => {
		const { statuses: root } = await seedCde();
		await h.db.execute(sql`UPDATE statuses SET wip_limit = 3 WHERE id = ${root.started}`);
		await h.rebuild();
		await update({ project: "CDE", status: "in-progress", wipLimit: null });
		expect((await statusRow(root.started)).wip_limit).toBeNull();
		const colored = await update({ project: "CDE", status: "in-progress", color: "accent" });
		expect(colored.color).toBe("accent");
		expect(colored.wipLimit).toBeNull();
		const row = await statusRow(root.started);
		expect(row.color).toBe("accent");
		expect(row.wip_limit).toBeNull();
	});

	test("a reviewer on a non-review status is refused", async () => {
		const { statuses: root } = await seedCde();
		const error = await expectError(
			update({ project: "CDE", status: "in-progress", reviewer: "agent" }),
			"INPUT_VALIDATION_FAILED",
		);
		const issues = error.data.issues as Array<{ path?: Array<string | number> }>;
		expect(issues.some((issue) => issue.path?.includes("reviewer"))).toBe(true);
		expect((await statusRow(root.started)).reviewer).toBeNull();
	});
});

describe("statuses.update through inheritance", () => {
	test("an update through an inheriting project edits the owner's row", async () => {
		const { cde, statuses: root } = await seedCde();
		const web = await seedChild(h.db, cde, cde, "web");
		const api = await seedChild(h.db, cde, cde, "api");
		await h.rebuild();
		const updated = await update({ project: "CDE.web", status: "todo", name: "Backlog" });
		expect(updated.id).toBe(root.todo);
		expect(updated.projectId).toBe(cde);
		expect((await statusRow(root.todo)).name).toBe("Backlog");
		expect(await h.rows(sql`SELECT id FROM statuses WHERE project_id IN (${web}, ${api})`)).toEqual([]);
		const effective = await h.read(async (tx) => {
			await h.cache.rebuild(tx);
			return h.cache.effectiveStatuses(api).statuses.map((status) => status.name);
		});
		expect(effective).toContain("Backlog");
	});
});

describe("statuses.update side effects", () => {
	test("an update writes one activity row per field and emits statuses.changed", async () => {
		const { cde } = await seedCde();
		await update({ project: "CDE", status: "todo", name: "Backlog", color: "accent" });
		const rows = await activityRows(h);
		expect(rows.map((row) => row.field).sort()).toEqual(["color", "name"]);
		for (const row of rows) {
			expect(row.ticket_id).toBeNull();
			expect(row.project_id).toBe(cde);
		}
		expect(eventsOfType(h.flushed, "statuses.changed")).toEqual([{ type: "statuses.changed", projectId: cde }]);
	});
});

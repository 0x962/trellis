import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { seedChild, seedProject, seedStatuses, seedTicket } from "../../../fixtures";
import { expectError, type Harness, NOW, serviceHarness } from "../../../helpers/services.ts";
import * as projects from "../../../../src/services/projects.ts";
import * as statuses from "../../../../src/services/statuses.ts";

// An archived project still answers every read. Every mutation on it, and
// on any project below it, throws PROJECT_ARCHIVED. The one exception is
// the unarchive itself.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

// CDE > web (archived, owns its own six statuses, holds one ticket) > sub.
const seedArchived = async () => {
	const { rootId: cde } = await seedProject(h.db, "CDE");
	const web = await seedChild(h.db, cde, cde, "web", { archived_at: NOW });
	const own = await seedStatuses(h.db, web);
	const sub = await seedChild(h.db, web, cde, "sub");
	await seedTicket(h.db, { projectId: web, rootId: cde, statusId: own.todo });
	await h.rebuild();
	return { cde, web, sub, own };
};

describe("archived projects", () => {
	test("every mutation on an archived project throws PROJECT_ARCHIVED", async () => {
		const { own } = await seedArchived();
		const all = Object.values(own);
		const mutations: Record<string, () => Promise<unknown>> = {
			update: () => h.run((ctx, tx) => projects.update(ctx, tx, { project: "CDE.web", name: "Site" })),
			move: () => h.run((ctx, tx) => projects.move(ctx, tx, { project: "CDE.web", parent: null })),
			delete: () => h.run((ctx, tx) => projects.delete(ctx, tx, { project: "CDE.web", force: true })),
			setRepos: () =>
				h.run((ctx, tx) => projects.setRepos(ctx, tx, { project: "CDE.web", repos: [{ owner: "a", repo: "b" }] })),
			statusCreate: () =>
				h.run((ctx, tx) => statuses.create(ctx, tx, { project: "CDE.web", name: "Blocked", category: "started" })),
			statusUpdate: () =>
				h.run((ctx, tx) => statuses.update(ctx, tx, { project: "CDE.web", status: "todo", name: "Backlog" })),
			statusReorder: () =>
				h.run((ctx, tx) => statuses.reorder(ctx, tx, { project: "CDE.web", statuses: [...all].reverse() })),
			statusDelete: () => h.run((ctx, tx) => statuses.delete(ctx, tx, { project: "CDE.web", status: "canceled" })),
			statusClear: () => h.run((ctx, tx) => statuses.clear(ctx, tx, { project: "CDE.web" })),
		};
		for (const [name, mutation] of Object.entries(mutations)) {
			const error = await expectError(mutation(), "PROJECT_ARCHIVED");
			expect(error.code, name).toBe("PROJECT_ARCHIVED");
		}
		const read = await h.run((ctx, tx) => projects.get(ctx, tx, { project: "CDE.web" }));
		expect(read.name).toBe("Project web");
		expect(read.archivedAt).toBe(NOW.toISOString());
		expect(read.statuses).toHaveLength(6);
		expect(h.flushed).toEqual([]);
	});

	test("unarchive is allowed on an archived project", async () => {
		await seedArchived();
		const restored = await h.run((ctx, tx) => projects.update(ctx, tx, { project: "CDE.web", archived: false }));
		expect(restored.archivedAt).toBeNull();
	});

	test("an archived ancestor blocks a mutation in the subtree", async () => {
		const { sub } = await seedArchived();
		await expectError(
			h.run((ctx, tx) => projects.update(ctx, tx, { project: "CDE.web.sub", name: "Renamed" })),
			"PROJECT_ARCHIVED",
		);
		const read = await h.run((ctx, tx) => projects.get(ctx, tx, { project: "CDE.web.sub" }));
		expect(read.id).toBe(sub);
		expect(read.name).toBe("Project sub");
		expect(read.archivedAt).toBeNull();
	});
});

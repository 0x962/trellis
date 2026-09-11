import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ProjectSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { count, seedChild, seedProject } from "../../test/fixtures";
import {
	activityRows,
	at,
	eventsOfType,
	expectError,
	type Harness,
	NOW,
	serviceHarness,
	ULID,
} from "../../test/helpers/services.ts";
import * as projects from "./projects.ts";

// A root project takes a key and owns the six seeded statuses. A sub-project
// takes a parent, a slug, and inherits the nearest owner's statuses. Every
// create upserts the actor, writes one project-level activity row, and
// emits project.created after the commit.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

type ProjectRow = {
	id: string;
	root_id: string;
	parent_id: string | null;
	key: string | null;
	slug: string;
	ticket_counter: number;
	created_at: string;
};

const projectRow = (id: string) =>
	h.one<ProjectRow>(
		sql`SELECT id, root_id, parent_id, key, slug, ticket_counter, ${at("created_at")} FROM projects WHERE id = ${id}`,
	);

const seedCde = async () => {
	const seeded = await seedProject(h.db, "CDE");
	await h.rebuild();
	return seeded;
};

// The default description a new root hands to its tickets.
const DEFAULT_TEMPLATE = "## Context\n\n## Acceptance criteria\n- [ ]\n\n## Out of scope\n";

describe("projects.create ticket template", () => {
	const templateOf = (id: string) =>
		h.one<{ ticket_template: string }>(sql`SELECT ticket_template FROM projects WHERE id = ${id}`);

	test("a root created with no ticket template gets the default template", async () => {
		const project = await h.run((ctx, tx) => projects.create(ctx, tx, { key: "OPS", name: "Operations" }));

		expect(project.ticketTemplate).toBe(DEFAULT_TEMPLATE);
		expect((await templateOf(project.id)).ticket_template).toBe(DEFAULT_TEMPLATE);
	});

	test("a root created with a ticket template keeps that template", async () => {
		const project = await h.run((ctx, tx) =>
			projects.create(ctx, tx, { key: "OPS", name: "Operations", ticketTemplate: "## Steps\n" }),
		);

		expect((await templateOf(project.id)).ticket_template).toBe("## Steps\n");
	});
});

describe("projects.create on a root", () => {
	test("a root project takes its key, its own root id, and a zero counter", async () => {
		const created = await h.run((ctx, tx) => projects.create(ctx, tx, { key: "CDE", name: "Code" }));
		expect(created.id).toMatch(ULID);
		const row = await projectRow(created.id);
		expect(row).toEqual({
			id: created.id,
			root_id: created.id,
			parent_id: null,
			key: "CDE",
			slug: "cde",
			ticket_counter: 0,
			created_at: NOW.toISOString(),
		});
		expect(created.name).toBe("Code");
	});

	test("a root is seeded with the six statuses in order", async () => {
		const created = await h.run((ctx, tx) => projects.create(ctx, tx, { key: "CDE", name: "Code" }));
		const seeded = await h.rows(
			sql`SELECT name, category, reviewer, is_default, position FROM statuses WHERE project_id = ${created.id} ORDER BY position`,
		);
		expect(seeded).toEqual([
			{ name: "Todo", category: "todo", reviewer: null, is_default: true, position: 0 },
			{ name: "In Progress", category: "started", reviewer: null, is_default: false, position: 1 },
			{ name: "Agent Review", category: "review", reviewer: "agent", is_default: false, position: 2 },
			{ name: "Human Review", category: "review", reviewer: "human", is_default: false, position: 3 },
			{ name: "Done", category: "done", reviewer: null, is_default: false, position: 4 },
			{ name: "Canceled", category: "canceled", reviewer: null, is_default: false, position: 5 },
		]);
		expect(created.statuses.map((status) => status.name)).toEqual(seeded.map((status) => status.name));
		expect(created.statusesInheritedFrom).toBeNull();
	});

	test("a repeated key throws DUPLICATE on the key field", async () => {
		await seedCde();
		const error = await expectError(
			h.run((ctx, tx) => projects.create(ctx, tx, { key: "CDE", name: "Again" })),
			"DUPLICATE",
		);
		expect(error.data).toEqual({ field: "key" });
		expect(await count(h.db, "projects")).toBe(1);
	});
});

// Two active root projects never share a name, without letter case. An
// archived root keeps its name but does not hold it. A sub-project name is
// free, because a sub-project shows under its root.
describe("projects.create root name", () => {
	const createRoot = (key: string, name: string) => h.run((ctx, tx) => projects.create(ctx, tx, { key, name }));

	test("a root name that an active root holds, in any letter case, throws DUPLICATE on the name field", async () => {
		await createRoot("OPS", "Operations");
		const error = await expectError(createRoot("OPX", "operations"), "DUPLICATE");
		expect(error.data).toEqual({ field: "name" });
		expect(await count(h.db, "projects")).toBe(1);
	});

	test("an archived root does not hold its name", async () => {
		await createRoot("OPS", "Operations");
		await h.run((ctx, tx) => projects.update(ctx, tx, { project: "OPS", archived: true }));
		const created = await createRoot("OPX", "Operations");
		expect(created.name).toBe("Operations");
	});

	test("a sub-project can take the name of a root", async () => {
		await createRoot("OPS", "Operations");
		const created = await h.run((ctx, tx) => projects.create(ctx, tx, { parent: "OPS", name: "Operations" }));
		expect(created.name).toBe("Operations");
	});
});

describe("projects.create on a sub-project", () => {
	test("a sub-project seeds no status and inherits the root's set", async () => {
		const { rootId, statuses } = await seedCde();
		const created = await h.run((ctx, tx) => projects.create(ctx, tx, { parent: "CDE", name: "Web" }));
		expect(await h.rows(sql`SELECT id FROM statuses WHERE project_id = ${created.id}`)).toEqual([]);
		expect(created.statuses.map((status) => status.id)).toEqual(Object.values(statuses));
		expect(created.statusesInheritedFrom).toBe(rootId);
	});

	test("a sub-project takes the root id of its parent and no key", async () => {
		const { rootId } = await seedCde();
		const created = await h.run((ctx, tx) => projects.create(ctx, tx, { parent: "CDE", name: "Web" }));
		const row = await projectRow(created.id);
		expect(row.root_id).toBe(rootId);
		expect(row.parent_id).toBe(rootId);
		expect(row.key).toBeNull();
		expect(row.ticket_counter).toBe(0);
		expect(created.path).toBe("CDE.web");
	});

	test("a slug is unique per parent and free under another parent", async () => {
		const { rootId } = await seedCde();
		await seedChild(h.db, rootId, rootId, "web");
		await seedChild(h.db, rootId, rootId, "api");
		await h.rebuild();
		const error = await expectError(
			h.run((ctx, tx) => projects.create(ctx, tx, { parent: "CDE", name: "Web", slug: "web" })),
			"DUPLICATE",
		);
		expect(error.data).toEqual({ field: "slug" });
		const created = await h.run((ctx, tx) => projects.create(ctx, tx, { parent: "CDE.api", name: "Web", slug: "web" }));
		expect(created.path).toBe("CDE.api.web");
	});

	test("the slug comes from the name when the caller sends none", async () => {
		await seedCde();
		const created = await h.run((ctx, tx) => projects.create(ctx, tx, { parent: "CDE", name: "Web Auth" }));
		expect(created.slug).toBe("web-auth");
		expect((await projectRow(created.id)).slug).toBe("web-auth");
	});

	test("a derived slug that is reserved throws DUPLICATE", async () => {
		await seedCde();
		const error = await expectError(
			h.run((ctx, tx) => projects.create(ctx, tx, { parent: "CDE", name: "Board" })),
			"DUPLICATE",
		);
		expect(error.data).toEqual({ field: "slug" });
	});

	test("a create under an archived parent throws PROJECT_ARCHIVED", async () => {
		const { rootId } = await seedCde();
		await seedChild(h.db, rootId, rootId, "old", { archived_at: NOW });
		await h.rebuild();
		await expectError(
			h.run((ctx, tx) => projects.create(ctx, tx, { parent: "CDE.old", name: "Child" })),
			"PROJECT_ARCHIVED",
		);
		expect(await count(h.db, "projects")).toBe(2);
	});
});

describe("projects.create side effects", () => {
	test("a create upserts the actor and writes one activity row", async () => {
		const created = await h.run((ctx, tx) => projects.create(ctx, tx, { key: "CDE", name: "Code" }));
		expect(await h.rows(sql`SELECT name, kind FROM actors`)).toEqual([{ name: "dana", kind: "human" }]);
		const rows = await activityRows(h);
		expect(rows).toHaveLength(1);
		const row = rows[0]!;
		expect(row.batch_id).toMatch(ULID);
		expect(row.ticket_id).toBeNull();
		expect(row.project_id).toBe(created.id);
		expect(row.root_id).toBe(created.id);
		expect(row.action).toBe("project.created");
		expect({ name: row.actor_name, kind: row.actor_kind }).toEqual({ name: "dana", kind: "human" });
		expect(row.created_at).toBe(NOW.toISOString());
	});

	// A sink that queries while the transaction is open waits on the lock the
	// transaction holds and the test times out, so a count of 1 inside the
	// sink proves the commit came first.
	test("a create emits project.created once after the commit", async () => {
		const observed: Array<{ types: string[]; projects: number }> = [];
		const { result } = await h.runWithSink(
			(ctx, tx) => projects.create(ctx, tx, { key: "CDE", name: "Code" }),
			async (events) => {
				observed.push({ types: events.map((event) => event.type), projects: await count(h.db, "projects") });
			},
		);
		expect(observed).toEqual([{ types: ["project.created"], projects: 1 }]);
		const { result: second } = await h.runWithSink(
			(ctx, tx) => projects.create(ctx, tx, { parent: "CDE", name: "Web" }),
			(events) => {
				h.flushed.push(...events);
			},
		);
		expect(eventsOfType(h.flushed, "project.created")).toEqual([{ type: "project.created", id: second.id }]);
		expect(result.id).not.toBe(second.id);
	}, 2000);

	test("the create result matches ProjectSchema", async () => {
		const created = await h.run((ctx, tx) => projects.create(ctx, tx, { key: "CDE", name: "Code" }));
		const parsed = ProjectSchema.parse(created);
		expect(parsed.ancestors).toEqual([]);
		expect(parsed.children).toEqual([]);
		expect(parsed.repos).toEqual([]);
		expect(parsed.statuses).toHaveLength(6);
		expect(parsed.statusesInheritedFrom).toBeNull();
		expect(parsed.path).toBe("CDE");
		expect(parsed.depth).toBe(0);
		expect(parsed.createdAt).toBe(NOW.toISOString());
	});
});

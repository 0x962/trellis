import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { seedChild, seedProject, seedRootWithStatuses, seedStatus, seedTicket } from "../../test/fixtures";
import { expectError, type Harness, serviceHarness } from "../../test/helpers/services.ts";
import { countStatements } from "../../test/helpers/statements.ts";
import { resolveProject, resolveStatus, resolveTicket } from "./refs.ts";

// A ref is what a client types: a ULID, `CDE-1`, `CDE.web.auth`, or a
// status name, slug, or `category:x`. Every grammar ignores letter case.
// Projects resolve through the cache and run no query. A status resolves
// inside the effective set of its project, the owner's set.

let h: Harness;
beforeAll(async () => {
	h = await serviceHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const noEmit = () => {};

// CDE with six statuses, CDE > web > auth, CDE > api, one ticket CDE-1 on
// Todo, and a second root OPS with its own six statuses.
const seedTree = async () => {
	const { rootId: cde, statuses } = await seedProject(h.db, "CDE");
	const web = await seedChild(h.db, cde, cde, "web");
	const auth = await seedChild(h.db, web, cde, "auth");
	const api = await seedChild(h.db, cde, cde, "api");
	const ticket = await seedTicket(h.db, { projectId: cde, rootId: cde, statusId: statuses.todo, number: 1 });
	const ops = await seedRootWithStatuses(h.db, "OPS");
	await h.rebuild();
	return { cde, web, auth, api, ticket, statuses, ops };
};

const ticketRef = (ref: string) => h.read((tx) => resolveTicket(h.ctx(noEmit), tx, ref));
const projectRef = (ref: string) => h.read((tx) => resolveProject(h.ctx(noEmit), tx, ref));
const statusRef = (projectId: string, status: string) =>
	h.read((tx) => resolveStatus(h.ctx(noEmit), tx, { projectId, status }));

describe("resolveTicket", () => {
	test("resolveTicket accepts a ULID in any letter case", async () => {
		const { ticket } = await seedTree();
		const row = await ticketRef(ticket.toLowerCase());
		expect(row.id).toBe(ticket);
		expect(row.number).toBe(1);
	});

	test("resolveTicket accepts the KEY-n form in any letter case", async () => {
		const { ticket } = await seedTree();
		const row = await ticketRef("cde-1");
		expect(row.id).toBe(ticket);
	});

	test("resolveTicket throws NOT_FOUND for a number that does not exist", async () => {
		await seedTree();
		const error = await expectError(ticketRef("CDE-999"), "NOT_FOUND");
		expect(error.data).toEqual({ kind: "ticket", ref: "CDE-999" });
	});

	test("resolveTicket throws NOT_FOUND for an unknown key", async () => {
		await seedTree();
		const error = await expectError(ticketRef("ZZZ-1"), "NOT_FOUND");
		expect(error.data).toEqual({ kind: "ticket", ref: "ZZZ-1" });
	});
});

describe("resolveProject", () => {
	test("resolveProject accepts a key in any letter case", async () => {
		const { cde } = await seedTree();
		const row = await projectRef("cde");
		expect(row.id).toBe(cde);
		expect(row.key).toBe("CDE");
	});

	test("resolveProject walks a dotted path to the nested project", async () => {
		const { auth } = await seedTree();
		const row = await projectRef("cde.web.auth");
		expect(row.id).toBe(auth);
		expect(row.slug).toBe("auth");
	});

	test("resolveProject throws NOT_FOUND when a segment is not a child of the previous one", async () => {
		await seedTree();
		const error = await expectError(projectRef("cde.api.auth"), "NOT_FOUND");
		expect(error.data).toEqual({ kind: "project", ref: "CDE.api.auth" });
	});

	test("resolveProject accepts a ULID", async () => {
		const { web } = await seedTree();
		const row = await projectRef(web);
		expect(row.id).toBe(web);
	});

	test("resolveProject answers from the cache and runs no query", async () => {
		const { auth } = await seedTree();
		let resolved = "";
		const statements = await h.read((tx) =>
			countStatements(h.db.$client, async () => {
				resolved = (await resolveProject(h.ctx(noEmit), tx, "CDE.web.auth")).id;
			}),
		);
		expect(resolved).toBe(auth);
		expect(statements).toBe(0);
	});
});

describe("resolveStatus", () => {
	test("resolveStatus matches a status name without letter case", async () => {
		const { cde, statuses } = await seedTree();
		const status = await statusRef(cde, "in progress");
		expect(status.id).toBe(statuses.started);
		expect(status.name).toBe("In Progress");
	});

	test("resolveStatus matches a status slug", async () => {
		const { cde, statuses } = await seedTree();
		expect((await statusRef(cde, "in-progress")).id).toBe(statuses.started);
	});

	test("resolveStatus accepts a ULID inside the effective set", async () => {
		const { cde, statuses } = await seedTree();
		expect((await statusRef(cde, statuses.done)).id).toBe(statuses.done);
	});

	test("resolveStatus refuses a status of another project with the valid list", async () => {
		const { cde, statuses, ops } = await seedTree();
		const error = await expectError(statusRef(cde, ops.statuses.todo), "STATUS_NOT_IN_PROJECT");
		const valid = error.data.valid as Array<{ id: string; name: string }>;
		expect(valid.map((status) => status.id)).toEqual(Object.values(statuses));
		expect(valid.map((status) => status.name)).toEqual([
			"Todo",
			"In Progress",
			"Agent Review",
			"Human Review",
			"Done",
			"Canceled",
		]);
	});

	test("resolveStatus with category picks the lowest position of that category", async () => {
		const { cde, statuses } = await seedTree();
		const status = await statusRef(cde, "category:review");
		expect(status.id).toBe(statuses.agentReview);
		expect(status.name).toBe("Agent Review");
	});

	test("resolveStatus throws when no status carries the category", async () => {
		const { cde, web } = await seedTree();
		const own = await seedStatus(h.db, {
			projectId: web,
			name: "Todo",
			category: "todo",
			position: 0,
			isDefault: true,
		});
		await seedStatus(h.db, { projectId: web, name: "Doing", category: "started", position: 1 });
		await h.rebuild();
		const error = await expectError(statusRef(web, "category:done"), "STATUS_NOT_IN_PROJECT");
		const valid = error.data.valid as Array<{ id: string }>;
		expect(valid.map((status) => status.id)).toContain(own);
		expect(valid).toHaveLength(2);
		expect(await h.rows(sql`SELECT id FROM statuses WHERE project_id = ${cde}`)).toHaveLength(6);
	});

	test("resolveStatus resolves an inheriting project in the owner's set", async () => {
		const { web, statuses } = await seedTree();
		const status = await statusRef(web, "todo");
		expect(status.id).toBe(statuses.todo);
	});

	test("resolveStatus throws for a name outside the effective set", async () => {
		const { cde, statuses } = await seedTree();
		const error = await expectError(statusRef(cde, "shipped"), "STATUS_NOT_IN_PROJECT");
		const valid = error.data.valid as Array<{ id: string }>;
		expect(valid.map((status) => status.id)).toEqual(Object.values(statuses));
	});
});

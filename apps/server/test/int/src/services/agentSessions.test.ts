import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { AGENT_PERSON_NAMES } from "@trellis/api";
import { ulid } from "ulid";
import { reserveName } from "../../../../src/services/agentSessions.ts";
import { insertRow, seedProject, seedRootWithStatuses, seedTicket } from "../../../fixtures";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

// reserveName gives a new agent the person name that a human calls it by.
// The live agents of one project hold different names, so a name names one
// agent at a time.

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterEach(() => h.db.transaction(assertStatusInvariant));
afterAll(() => h.close());

const seed = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticketId = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
	return { rootId, ticketId };
};

// One builder of `ticketId` that holds `name`. A builder in `state`
// `running` holds its terminal, so a person can call it by its name.
const builder = (projectId: string, ticketId: string, name: string, state = "running") =>
	insertRow(h.db, "agent_sessions", {
		id: ulid(),
		project_id: projectId,
		ticket_id: ticketId,
		role: "builder",
		runner: "superset",
		state,
		workspace_id: null,
		terminal_id: null,
		claude_session_id: null,
		name,
		title: "CDE-1",
		open_url: null,
		last_woken_at: null,
		created_at: new Date(),
		updated_at: new Date(),
	});

const reserve = (projectId: string) => h.db.transaction((tx) => reserveName(tx, projectId));

const pool = [...AGENT_PERSON_NAMES];

describe("reserveName", () => {
	test("gives the first agent of a project a name of the pool", async () => {
		const { rootId } = await seed();
		expect(pool).toContain(await reserve(rootId));
	});

	test("passes over every name that a live agent of the project holds", async () => {
		const { rootId, ticketId } = await seed();
		const taken = pool.slice(0, 40);
		for (const name of taken) await builder(rootId, ticketId, name);
		for (let step = 0; step < 10; step += 1) {
			const name = await reserve(rootId);
			expect(pool).toContain(name);
			expect(taken).not.toContain(name);
		}
	});

	test("a name that another project holds stays free", async () => {
		const first = await seed();
		const second = await seedRootWithStatuses(h.db, "OPS");
		for (const name of pool) await builder(first.rootId, first.ticketId, name);
		expect(pool).toContain(await reserve(second.rootId));
	});

	test("the name of an exited or a stopped agent goes back to the pool", async () => {
		const { rootId, ticketId } = await seed();
		for (const name of pool) await builder(rootId, ticketId, name, "exited");
		await builder(rootId, ticketId, pool[0]!, "stopped");
		expect(pool).toContain(await reserve(rootId));
	});

	test("with every name held by a live agent the next agent gets the name and a number", async () => {
		const { rootId, ticketId } = await seed();
		for (const name of pool) await builder(rootId, ticketId, name);
		const repeat = await reserve(rootId);
		expect(repeat).toMatch(/^[A-Za-z]+ 2$/);
		expect(pool).toContain(repeat.replace(/ 2$/, ""));
	});
});

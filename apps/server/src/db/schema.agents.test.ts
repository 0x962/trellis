import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { count, insertRow, type Row, seedProject, seedTicket } from "../../test/fixtures";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { checkNamed, FOREIGN_KEY, UNIQUE } from "../../test/helpers/errors.ts";

// agent_sessions holds one row per agent the runner started or that
// registered itself. agent_cursors holds the last activity id each
// project's manager read.

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const session = (projectId: string, overrides: Row = {}) =>
	insertRow(h.db, "agent_sessions", {
		id: ulid(),
		project_id: projectId,
		ticket_id: null,
		role: "manager",
		runner: "superset",
		state: "running",
		workspace_id: null,
		terminal_id: null,
		claude_session_id: null,
		title: "CDE manager",
		open_url: null,
		last_woken_at: null,
		created_at: new Date(),
		updated_at: new Date(),
		...overrides,
	});

const ticketOf = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticketId = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo });
	return { rootId, ticketId };
};

describe("agent_sessions", () => {
	test("a manager names no ticket, and a builder or a reviewer names one", async () => {
		const { rootId, ticketId } = await ticketOf();
		await expect(session(rootId, { ticket_id: ticketId })).rejects.toThrow(checkNamed("agent_sessions_ticket_check"));
		await expect(session(rootId, { role: "builder", title: "CDE-1" })).rejects.toThrow(
			checkNamed("agent_sessions_ticket_check"),
		);
		await session(rootId, { role: "builder", ticket_id: ticketId, title: "CDE-1" });
		expect(await count(h.db, "agent_sessions")).toBe(1);
	});

	test("role, runner, state, and title stay inside their sets", async () => {
		const { rootId } = await ticketOf();
		await expect(session(rootId, { role: "janitor" })).rejects.toThrow(checkNamed("agent_sessions_role_check"));
		await expect(session(rootId, { runner: "tmux" })).rejects.toThrow(checkNamed("agent_sessions_runner_check"));
		await expect(session(rootId, { state: "asleep" })).rejects.toThrow(checkNamed("agent_sessions_state_check"));
		await expect(session(rootId, { title: "" })).rejects.toThrow(checkNamed("agent_sessions_title_check"));
		await expect(session(rootId, { title: "x".repeat(121) })).rejects.toThrow(checkNamed("agent_sessions_title_check"));
	});

	test("a project has one live manager; exited and stopped managers do not count", async () => {
		const { rootId } = await ticketOf();
		await session(rootId, { state: "exited" });
		await session(rootId, { state: "stopped" });
		await session(rootId, { state: "running" });
		await expect(session(rootId, { state: "starting" })).rejects.toThrow(UNIQUE);
	});

	test("one terminal holds one session", async () => {
		const { rootId, ticketId } = await ticketOf();
		await session(rootId, { workspace_id: "ws-1", terminal_id: "t-1" });
		await expect(
			session(rootId, { role: "builder", ticket_id: ticketId, title: "CDE-1", workspace_id: "ws-1", terminal_id: "t-1" }),
		).rejects.toThrow(UNIQUE);
		await session(rootId, { role: "builder", ticket_id: ticketId, title: "CDE-1", workspace_id: "ws-1" });
	});

	test("a project delete and a ticket delete remove their sessions", async () => {
		const { rootId, ticketId } = await ticketOf();
		await session(rootId, { role: "builder", ticket_id: ticketId, title: "CDE-1" });
		await h.db.execute(sql`DELETE FROM tickets WHERE id = ${ticketId}`);
		expect(await count(h.db, "agent_sessions")).toBe(0);
		await session(rootId);
		await h.db.execute(sql`DELETE FROM projects WHERE id = ${rootId}`);
		expect(await count(h.db, "agent_sessions")).toBe(0);
		await expect(session(ulid())).rejects.toThrow(FOREIGN_KEY);
	});
});

describe("agent_cursors", () => {
	test("each project has one cursor that starts at 0 and goes with the project", async () => {
		const { rootId } = await ticketOf();
		await insertRow(h.db, "agent_cursors", { project_id: rootId, updated_at: new Date() });
		const found = await h.db.execute(sql`SELECT activity_id FROM agent_cursors WHERE project_id = ${rootId}`);
		expect(found.rows).toEqual([{ activity_id: 0 }]);
		await expect(insertRow(h.db, "agent_cursors", { project_id: rootId, updated_at: new Date() })).rejects.toThrow(
			UNIQUE,
		);
		await h.db.execute(sql`DELETE FROM projects WHERE id = ${rootId}`);
		expect(await count(h.db, "agent_cursors")).toBe(0);
	});
});

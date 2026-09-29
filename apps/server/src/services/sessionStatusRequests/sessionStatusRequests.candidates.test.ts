import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import { sessionStatusRequestCandidates } from "./sessionStatusRequests.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const at = new Date("2026-09-29T12:00:00.000Z");
const projectId = ulid();
const archivedProjectId = ulid();
const activeStatusId = ulid();
const doneStatusId = ulid();
const activeTicketId = ulid();
const doneTicketId = ulid();
const activeTicketRunId = ulid();
const doneTicketRunId = ulid();
const standaloneRunId = ulid();
const archivedRunId = ulid();
const closedRunId = ulid();
const archivedProjectRunId = ulid();
const activeTicketSessionId = ulid();
const doneTicketSessionId = ulid();
const standaloneSessionId = ulid();
const archivedSessionId = ulid();
const closedSessionId = ulid();
const archivedProjectSessionId = ulid();

beforeAll(async () => {
	db = await openTestDb();
	await db.execute(sql`INSERT INTO projects (id, key, slug, name, archived_at, created_at, updated_at) VALUES
		(${projectId}, 'STS', 'status', 'Status', NULL, ${at}, ${at}),
		(${archivedProjectId}, 'OLD', 'old-status', 'Old status', ${at}, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO statuses (
		id, project_id, name, slug, category, color, position, is_default, created_at, updated_at
	) VALUES
		(${activeStatusId}, ${projectId}, 'In Progress', 'in-progress', 'started', 'fg-muted', 0, true, ${at}, ${at}),
		(${doneStatusId}, ${projectId}, 'Done', 'done', 'done', 'fg-muted', 1, false, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO tickets (
		id, project_id, number, title, status_id, position, created_at, updated_at
	) VALUES
		(${activeTicketId}, ${projectId}, 1, 'Active work', ${activeStatusId}, 0, ${at}, ${at}),
		(${doneTicketId}, ${projectId}, 2, 'Done work', ${doneStatusId}, 1, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO agent_runs (
		id, name, kind, instruction, project_id, project_key, ticket_id, ticket_identifier,
		terminal_id, closed_at, created_at, updated_at
	) VALUES
		(${activeTicketRunId}, 'active-ticket', 'agent', 'Work', ${projectId}, 'STS', ${activeTicketId}, 'STS-1', 'active-ticket-attempt', NULL, ${at}, ${at}),
		(${doneTicketRunId}, 'done-ticket', 'agent', 'Work', ${projectId}, 'STS', ${doneTicketId}, 'STS-2', 'done-ticket-attempt', NULL, ${at}, ${at}),
		(${standaloneRunId}, 'standalone', 'session', 'Work', NULL, '', NULL, NULL, 'standalone-attempt', NULL, ${at}, ${at}),
		(${archivedRunId}, 'archived', 'session', 'Work', NULL, '', NULL, NULL, 'archived-attempt', NULL, ${at}, ${at}),
		(${closedRunId}, 'closed', 'session', 'Work', NULL, '', NULL, NULL, 'closed-attempt', ${at}, ${at}, ${at}),
		(${archivedProjectRunId}, 'archived-project', 'session', 'Work', ${archivedProjectId}, 'OLD', NULL, NULL, 'archived-project-attempt', NULL, ${at}, ${at})`);
	await db.execute(sql`INSERT INTO sessions (
		id, name, directory, harness, run_id, archived_at, created_at, updated_at
	) VALUES
		(${activeTicketSessionId}, 'active-ticket', '/tmp/active-ticket', '{"preset":"codex"}'::jsonb, ${activeTicketRunId}, NULL, ${at}, ${at}),
		(${doneTicketSessionId}, 'done-ticket', '/tmp/done-ticket', '{"preset":"codex"}'::jsonb, ${doneTicketRunId}, NULL, ${at}, ${at}),
		(${standaloneSessionId}, 'standalone', '/tmp/standalone', '{"preset":"codex"}'::jsonb, ${standaloneRunId}, NULL, ${at}, ${at}),
		(${archivedSessionId}, 'archived', '/tmp/archived', '{"preset":"codex"}'::jsonb, ${archivedRunId}, ${at}, ${at}, ${at}),
		(${closedSessionId}, 'closed', '/tmp/closed', '{"preset":"codex"}'::jsonb, ${closedRunId}, NULL, ${at}, ${at}),
		(${archivedProjectSessionId}, 'archived-project', '/tmp/archived-project', '{"preset":"codex"}'::jsonb, ${archivedProjectRunId}, NULL, ${at}, ${at})`);
});

afterAll(async () => db.$client.close());

test("lists active ticket and standalone sessions only", async () => {
	const found = await db.transaction(sessionStatusRequestCandidates);

	expect(found).toHaveLength(2);
	expect(found).toEqual(
		expect.arrayContaining([
			{ sessionId: activeTicketSessionId, terminalId: "active-ticket-attempt" },
			{ sessionId: standaloneSessionId, terminalId: "standalone-attempt" },
		]),
	);
});

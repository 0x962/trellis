import { afterEach, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "../client.ts";
import { fixture } from "../epicCancellation/fixture.ts";
import { migrate } from "../migrate.ts";
import { agentRuns, epicWhiteboards, sessions, tickets } from "../schema.ts";
import { openTestDbFromArchive } from "../testDb.ts";

const databases: Db[] = [];

afterEach(async () => {
	for (const db of databases.splice(0)) await db.$client.close();
});

test("database reopen preserves saved boards, loose tickets, and session conversations", async () => {
	const h = await fixture();
	databases.push(h.db);
	const epic = await h.create("Saved design");
	const ticket = await h.ticket(epic.id);
	await h.db.update(tickets).set({ waveId: null }).where(eq(tickets.id, ticket.id));
	const runId = ulid();
	const sessionId = ulid();
	const now = h.ctx().now;
	const harness = { preset: "claude" };
	await h.db.insert(agentRuns).values({
		id: runId,
		name: "Database research",
		kind: "session",
		instruction: "Compare database options.",
		projectId: h.projectId,
		projectKey: "CAN",
		harness,
		sessionId: "provider-conversation",
		workspaceId: "existing-workspace",
		terminalId: "existing-terminal",
		createdAt: now,
		updatedAt: now,
	});
	await h.db.insert(sessions).values({
		id: sessionId,
		name: "Database research",
		directory: "/sessions/database-research",
		harness,
		runId,
		createdAt: now,
		updatedAt: now,
	});
	const snapshot = {
		store: {
			"shape:ticket": { typeName: "shape", type: "ticket", x: 240, y: 160, props: { ticketId: ticket.id } },
			"shape:session": { typeName: "shape", type: "session", x: 800, y: 160, props: { sessionId, runId } },
			"shape:note": { typeName: "shape", type: "text", props: { text: "Compare document stores." } },
		},
	};
	await h.db.insert(epicWhiteboards).values({ epicId: epic.id, snapshot, revision: 7, updatedAt: now });
	const records = (db: Db) =>
		db.execute(sql`
			SELECT
				(SELECT row_to_json(b) FROM epic_whiteboards b WHERE epic_id = ${epic.id}) AS board,
				(SELECT row_to_json(t) FROM tickets t WHERE id = ${ticket.id}) AS ticket,
				(SELECT row_to_json(s) FROM sessions s WHERE id = ${sessionId}) AS session,
				(SELECT row_to_json(r) FROM agent_runs r WHERE id = ${runId}) AS run
		`);
	const before = (await records(h.db)).rows;
	const archived = await h.db.$client.dumpDataDir("none");
	await h.db.$client.close();
	databases.splice(databases.indexOf(h.db), 1);
	const reopened = await openTestDbFromArchive(archived);
	databases.push(reopened);

	expect(await migrate(reopened)).toBe(0);
	expect((await records(reopened)).rows).toEqual(before);
	expect((await reopened.select().from(epicWhiteboards))[0]).toMatchObject({ snapshot, revision: 7 });
	expect((await reopened.select().from(tickets).where(eq(tickets.id, ticket.id)))[0]).toMatchObject({
		epicId: epic.id,
		waveId: null,
	});
}, 60_000);

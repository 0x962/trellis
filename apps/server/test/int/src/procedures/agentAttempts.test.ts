import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { reserveAttempt } from "../../../../src/services/assignments/attempts.ts";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
let ticket: string;
let runId: string;
let token: string;
beforeEach(async () => {
	t = await createTestApp();
	const project = await t.seedProject("TOK");
	const work = await t.createTicket({ project: "TOK", title: "Original" });
	ticket = work.identifier;
	runId = ulid();
	await t.editServerTx(async (tx) => {
		await tx.execute(sql`INSERT INTO agent_runs (id, name, runtime, persona_name, kind, instruction, project_id, project_path, ticket_id, state, created_at, updated_at)
			VALUES (${runId}, 'Builder', 'native', 'Builder', 'builder', 'Build.', ${project.id}, 'TOK', ${work.id}, 'running', NOW(), NOW())`);
		const attempt = await reserveAttempt({ now: new Date() }, tx, { runId });
		token = attempt.token;
		await tx.execute(sql`UPDATE agent_runs SET terminal_id = ${attempt.id} WHERE id = ${runId}`);
	});
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("native agent mutations require the current token while human edits remain available", async () => {
	const old = await t.api(`/api/tickets/${ticket}`, {
		method: "PATCH",
		actor: `agent:${runId}`,
		body: { title: "Old token" },
	});
	expect(old.status).toBe(400);
	const current = await t.api(`/api/tickets/${ticket}`, {
		method: "PATCH",
		actor: `agent:${runId}`,
		headers: { "x-trellis-attempt": token },
		body: { title: "Current token" },
	});
	expect(current.status).toBe(200);
	await t.editServerTx((tx) => reserveAttempt({ now: new Date() }, tx, { runId }));
	const stale = await t.api(`/api/tickets/${ticket}`, {
		method: "PATCH",
		actor: `agent:${runId}`,
		headers: { "x-trellis-attempt": token },
		body: { title: "Stale token" },
	});
	expect(stale.status).toBe(400);
	expect((await t.client.tickets.get({ ticket })).title).toBe("Current token");
	expect((await t.api(`/api/tickets/${ticket}`, { method: "PATCH", body: { title: "Human edit" } })).status).toBe(200);
});

test("an expired agent cannot enter a prepared external action", async () => {
	const result = await t.api(`/api/agent-runs/${runId}/send`, {
		method: "POST",
		actor: `agent:${runId}`,
		headers: { "x-trellis-attempt": "expired" },
		body: { text: "Do more work" },
	});
	expect(result.status).toBe(400);
	expect(result.body.data.issues[0].path).toEqual(["attempt"]);
});

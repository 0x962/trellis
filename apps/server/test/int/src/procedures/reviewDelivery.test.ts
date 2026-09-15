import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createTestApp, type TestApp } from "../../../helpers/app";
import { assertStatusInvariant } from "../../../invariants";

let t: TestApp;
let runId: string;
beforeEach(async () => {
	t = await createTestApp({ home: mkdtempSync("/tmp/trellis-review-delivery-") });
	const project = await t.seedProject("RVD");
	await t.client.projects.setRepos({ project: "RVD", repos: [{ owner: "example", repo: "code" }] });
	runId = ulid();
	await t.editServerTx((tx) =>
		tx.execute(sql`INSERT INTO agent_runs
		(id,name,runtime,persona_name,kind,instruction,project_id,project_path,terminal_id,closed_at,created_at,updated_at)
		VALUES (${runId},'Manager','native','Manager','manager','Manage.',${project.id},'RVD',${ulid()},NOW(),NOW(),NOW())`),
	);
});
afterEach(async () => {
	const socket = join(t.home, "runtime", "runtime.sock");
	if (existsSync(socket)) await new RuntimeClient(socket).shutdown();
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
const request = (path: string, body: unknown) => t.api(`/api/reviews${path}`, { method: "POST", body });
test("retains unread submissions when an agent is stopped and sends only after an explicit resend", async () => {
	const body = {
		pr: "owner/repo#80",
		requestId: "notify-1",
		verdict: "changes_requested",
		body: "Fix this",
		recipients: [runId, runId],
		drafts: [{ path: "a.ts", line: 1, body: "Finding" }],
	};
	const submitted = await request("/submit", body);
	expect(submitted.status).toBe(200);
	expect(submitted.body.deliveries).toHaveLength(1);
	const deliver = () =>
		t.transport.call("reviews.deliverPending", { actor: null, session: null, reqId: "delivery", now: new Date() }, {});
	await deliver();
	const failed = await t.api(`/api/reviews/submissions/${submitted.body.id}`);
	expect(failed.body.deliveries[0].state).toBe("failed");
	expect(failed.body.deliveries[0].error).toContain(
		"This assignment is closed. Start a new attempt before sending a message.",
	);
	const inbox = await t.api("/api/reviews/inbox", {
		method: "POST",
		body: { runId },
	});
	expect(inbox.body).toHaveLength(1);
	await request(`/deliveries/${failed.body.deliveries[0].id}/resend`, {});
	expect((await t.api(`/api/reviews/submissions/${submitted.body.id}`)).body.deliveries[0].state).toBe("pending");
	await request(`/submissions/${submitted.body.id}/read`, { runId });
	expect((await request("/inbox", { runId })).body).toHaveLength(0);
});
test("rolls back draft writes when a recipient does not exist", async () => {
	const result = await request("/submit", {
		pr: "owner/repo#81",
		requestId: "invalid-recipient",
		verdict: "commented",
		recipients: [ulid()],
		drafts: [{ path: "a.ts", line: 1, body: "Discarded" }],
	});
	expect(result.status).toBe(400);
	expect(
		(await t.api(`/api/reviews/threads?pr=${encodeURIComponent("owner/repo#81")}&all=true`)).body.items,
	).toHaveLength(0);
});

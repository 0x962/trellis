import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
beforeEach(async () => {
	t = await createTestApp({
		gh: Object.assign(async () => ({ ok: false as const, reason: "missing" as const, message: "offline" }), {
			bin: "gh",
			timeoutMs: 100,
		}),
	});
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
const pr = "owner/repo#12";
const post = (path: string, body: unknown) => t.api(`/api/reviews${path}`, { method: "POST", body });

describe("local PR review", () => {
	test("saves standalone threads and preserves range, session, replies, and resolution", async () => {
		const created = await t.api("/api/reviews/threads", {
			method: "POST",
			headers: { "x-trellis-session": "session-42" },
			body: { pr, path: "src/a.ts", side: "old", startLine: 3, line: 5, body: "Read this branch." },
		});
		expect(created.status).toBe(201);
		const id = created.body.id;
		expect(created.body).toMatchObject({
			path: "src/a.ts",
			side: "old",
			startLine: 3,
			line: 5,
			session: "session-42",
			revisionId: null,
			status: "open",
		});
		const reply = await post(`/threads/${id}/reply`, { body: "Fixed." });
		expect(reply.status).toBe(200);
		expect(reply.body.replies).toHaveLength(1);
		const resolved = await post(`/threads/${id}/resolve`, { resolved: true });
		expect(resolved.body).toMatchObject({ status: "resolved", resolvedBy: "dana" });
		expect((await t.api(`/api/reviews/threads?pr=${encodeURIComponent(pr)}`)).body.items).toHaveLength(0);
		expect((await t.api(`/api/reviews/threads?pr=${encodeURIComponent(pr)}&all=true`)).body.items).toHaveLength(1);
		await post(`/threads/${id}/resolve`, { resolved: false });
		const reacted = await post(`/messages/${id}/reaction`, { reaction: "+1", remove: false });
		expect(reacted.status).toBe(200);
		await post(`/messages/${id}/reaction`, { reaction: "+1", remove: false });
		const thread = await t.api(`/api/reviews/threads/${id}`);
		expect(thread.body.reactions).toHaveLength(1);
	});

	test("rejects invalid line ranges before a write", async () => {
		const result = await post("/threads", { pr, path: "a.ts", line: 2, startLine: 3, body: "Wrong range." });
		expect(result.status).toBe(400);
	});
});

import { afterAll, beforeAll, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app";
import { assertStatusInvariant } from "../../../invariants";

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
});
afterAll(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
const stamp = "2026-09-01T00:00:00.000Z";
const file = {
	url: "https://github.com/owner/repo/pull/99",
	comments: [
		{
			id: "c-12345678",
			path: "a.ts",
			side: "old",
			line: 5,
			startLine: 2,
			body: "Original",
			author: "agent",
			session: "session-1",
			status: "resolved",
			resolvedBy: "human",
			resolvedAt: stamp,
			createdAt: stamp,
			updatedAt: stamp,
			replies: [{ id: "r-12345678", body: "Reply", author: "human", createdAt: stamp }],
		},
	],
};
const request = (body: unknown) => t.api("/api/reviews/import-margin", { method: "POST", body });
test("previews imports and preserves legacy threads without duplicate or destructive updates", async () => {
	const preview = await request({ source: "fixture", files: [file], dryRun: true });
	expect(preview.status).toBe(200);
	expect(preview.body).toMatchObject({ imported: 1, skipped: 0, conflicts: [] });
	expect((await t.api("/api/reviews/prs")).body).toHaveLength(0);
	const imported = await request({ source: "fixture", files: [file], dryRun: false });
	expect(imported.body.imported).toBe(1);
	const repeat = await request({ source: "fixture", files: [file], dryRun: false });
	expect(repeat.body).toMatchObject({ imported: 0, skipped: 1 });
	const thread = await t.api("/api/reviews/threads/c-12345678");
	expect(thread.body).toMatchObject({
		body: "Original",
		session: "session-1",
		startLine: 2,
		line: 5,
		status: "resolved",
		resolvedBy: "human",
		revisionId: null,
	});
	expect(thread.body.replies[0]).toMatchObject({ body: "Reply", createdAt: stamp });
	const changed = structuredClone(file);
	changed.comments[0]!.body = "Later edit";
	expect((await request({ source: "fixture", files: [changed], dryRun: false })).body.conflicts).toHaveLength(1);
	expect((await t.api("/api/reviews/threads/c-12345678")).body.body).toBe("Original");
	const exported = await t.api(`/api/reviews/export?pr=${encodeURIComponent(file.url)}`);
	expect(exported.body.threads).toHaveLength(1);
	const complete = await (await t.app.request("/api/export")).text();
	expect(complete).toContain('"table":"review_threads"');
	expect(complete).toContain('"table":"review_imports"');
});

test("preserves a reversed range already stored by Margin", async () => {
	const legacy = structuredClone(file);
	legacy.url = "https://github.com/owner/repo/pull/100";
	legacy.comments[0]!.startLine = 9;
	const imported = await request({ source: "fixture", files: [legacy], dryRun: false });
	expect(imported.status).toBe(200);
	const thread = await t.api(`/api/reviews/threads/${imported.body.mapping[0].id}`);
	expect(thread.body).toMatchObject({ startLine: 9, line: 5 });
});

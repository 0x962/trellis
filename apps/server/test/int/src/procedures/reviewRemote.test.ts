import { afterEach, beforeEach, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app";
import { assertStatusInvariant } from "../../../invariants";

let t: TestApp;
const calls: string[][] = [];
let moved = false;
let head = "head";
const patch = `diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-before\n+${"x".repeat(1_100_000)}\n`;
beforeEach(async () => {
	head = "head";
	moved = false;
	calls.length = 0;
	t = await createTestApp({
		gh: Object.assign(
			async (_priority: unknown, args: string[]) => {
				calls.push(args);
				let stdout = "";
				if (args[0] === "pr" && args[1] === "diff") stdout = patch;
				else if (args.includes("headRefOid,baseRefOid"))
					stdout = JSON.stringify({ headRefOid: moved ? "changed" : head, baseRefOid: "base" });
				else if (args[0] === "pr" && args[1] === "view")
					stdout = JSON.stringify({
						id: "PR_id",
						title: "Test",
						state: "OPEN",
						headRefOid: head,
						baseRefOid: "base",
						headRepository: { nameWithOwner: "fork/repo" },
						headRefName: "feature",
						labels: [],
						comments: [],
					});
				else if (args[1]?.includes("compare/")) stdout = JSON.stringify({ merge_base_commit: { sha: "merge-base" } });
				else if (args[1]?.includes("contents/")) stdout = "original file";
				else if (args[1] === "graphql")
					stdout = JSON.stringify({ data: { repository: { pullRequest: { stack: null, mergeQueueEntry: null } } } });
				else if (args[0] === "label") stdout = "[]";
				return { ok: true as const, stdout, code: 0, stderr: "" };
			},
			{ bin: "gh", timeoutMs: 100 },
		),
	});
});
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
const pr = "owner/repo#30";
const post = (path: string, body: unknown) => t.api(`/api/reviews${path}`, { method: "POST", body });
test("reads current PR status without a new diff or a revision write", async () => {
	calls.length = 0;
	const status = await post("/status", { pr });
	expect(status.status).toBe(200);
	expect(status.body.headRefOid).toBe("head");
	expect(calls.some((args) => args[1] === "diff")).toBe(false);
	const saved = await t.api(`/api/reviews/revision?pr=${encodeURIComponent(pr)}`);
	expect(saved.body).toBeNull();
});
test("retains complete patches and reads old files at the merge base and new files from a fork", async () => {
	const result = await post("/refresh", { pr });
	expect(result.status).toBe(200);
	expect(result.body.patch).toBe(patch);
	expect(result.body.meta.comparisonBaseSha).toBe("merge-base");
	await post("/file", { pr, revisionId: result.body.id, path: "a.txt", side: "old" });
	expect(calls.at(-1)?.[1]).toBe("repos/owner/repo/contents/a.txt?ref=merge-base");
	await post("/file", { pr, revisionId: result.body.id, path: "a.txt", side: "new" });
	expect(calls.at(-1)?.[1]).toBe("repos/fork/repo/contents/a.txt?ref=head");
	moved = true;
	expect((await post("/refresh", { pr })).status).toBe(400);
});
test("GitHub mutations require an explicit action and a matching head", async () => {
	moved = false;
	expect((await post("/action", { pr, action: "merge", headSha: "stale" })).status).toBe(400);
	const result = await post("/action", { pr, action: "merge", headSha: "head" });
	expect(result.status).toBe(200);
	expect(
		calls.some(
			(a) => a.join(" ") === "pr merge https://github.com/owner/repo/pull/30 --squash --match-head-commit head",
		),
	).toBe(true);
});

test("a PR restored to an older commit pair selects its most recent refresh", async () => {
	const first = await post("/refresh", { pr });
	head = "second-head";
	const second = await post("/refresh", { pr });
	expect(second.body.id).not.toBe(first.body.id);
	head = "head";
	const restored = await post("/refresh", { pr });
	expect(restored.body.id).toBe(first.body.id);
	const latest = await t.api(`/api/reviews/revision?pr=${encodeURIComponent(pr)}`);
	expect(latest.body.id).toBe(first.body.id);
});

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { ReviewThread } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { openTestDb } from "../../db/testDb.ts";
import type { Tx } from "../../db/tx.ts";
import { withAnchorLines } from "./anchorLines.ts";

let db: Awaited<ReturnType<typeof openTestDb>>;
const prId = ulid();
const earlierId = ulid();
const headId = ulid();

// One file of three lines. The earlier revision changed line 2 to "two",
// and the head changed the same line to "three".
const patchOf = (text: string) =>
	[
		"diff --git a/file.ts b/file.ts",
		"--- a/file.ts",
		"+++ b/file.ts",
		"@@ -1,3 +1,3 @@",
		" one",
		"-old",
		`+${text}`,
		" tail",
		"",
	].join("\n");

const revision = (id: string, patch: string, fetchedAt: string) =>
	db.transaction((tx: Tx) =>
		tx.execute(
			sql`INSERT INTO review_revisions (id, pr_id, base_sha, head_sha, document, created_at)
			VALUES (${id}, ${prId}, 'base', ${id}, ${JSON.stringify({ id, prId, patch, fetchedAt })}::jsonb, now())`,
		),
	);

const thread = (revisionId: string | null): ReviewThread =>
	({
		id: ulid(),
		prId,
		path: "file.ts",
		side: "new",
		line: 2,
		startLine: 2,
		revisionId,
		body: "This name says nothing.",
		author: "backend-checks",
		kind: "agent",
		session: null,
		status: "open",
		createdAt: "2026-09-23T00:19:19.318Z",
		updatedAt: "2026-09-23T00:19:19.318Z",
		version: 1,
		resolvedAt: null,
		resolvedBy: null,
		replies: [],
		reactions: [],
	}) as ReviewThread;

beforeAll(async () => {
	db = await openTestDb();
	await db.transaction((tx: Tx) =>
		tx.execute(
			sql`INSERT INTO pull_requests (id, owner, repo, number, url, state, created_at, updated_at)
			VALUES (${prId}, 'acme', 'app', 29, 'https://github.com/acme/app/pull/29', 'open', now(), now())`,
		),
	);
	await revision(earlierId, patchOf("two"), "2026-09-23T00:10:00.000Z");
	await revision(headId, patchOf("three"), "2026-09-23T00:30:00.000Z");
});

afterAll(async () => db.$client.close());

test("reads the text a thread of an earlier revision was written against", async () => {
	const [found] = await db.transaction((tx: Tx) => withAnchorLines(tx, prId, [thread(earlierId)]));

	expect(found!.anchorLines).toEqual(["two"]);
});

test("leaves a thread of the newest revision alone, because the page holds that patch", async () => {
	const [found] = await db.transaction((tx: Tx) => withAnchorLines(tx, prId, [thread(headId)]));

	expect(found!.anchorLines).toBeUndefined();
});

test("leaves a thread that names no revision alone", async () => {
	const [found] = await db.transaction((tx: Tx) => withAnchorLines(tx, prId, [thread(null)]));

	expect(found!.anchorLines).toBeUndefined();
});

test("reads null when the earlier patch shows that line no more", async () => {
	const far = { ...thread(earlierId), line: 900, startLine: 900 };
	const [found] = await db.transaction((tx: Tx) => withAnchorLines(tx, prId, [far]));

	expect(found!.anchorLines).toBeNull();
});

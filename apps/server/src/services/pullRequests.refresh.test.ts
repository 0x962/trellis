import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { checkRun, graphqlReply, linkPr, seedPr, seedProject, seedTicket } from "../../test/fixtures";
import { eventSink, testCtx, withEmit } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { caught } from "../../test/helpers/errors.ts";
import { ghStub, type StubReply } from "../../test/helpers/gh-stub.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import { withTx } from "../db/tx.ts";
import { contentHash } from "../gh/graphql.ts";
import { createGhRunner } from "../gh/run.ts";
import { diff, prepareDiff, prepareRefresh, refresh } from "./pullRequests.ts";

// refresh reads one pull request through gh and writes the row only when the
// content hash changed. The fetch stamp moves on every call, so the poller
// knows when it last looked.

let h: TestDb;
let home: string;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	home = freshHomeWithDirs();
});
afterEach(() => h.db.transaction(assertStatusInvariant));
afterAll(() => h.close());

const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});
const stub = (replies: Record<string, StubReply>) => {
	const handle = ghStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-refresh-")), replies);
	restores.push(handle.restore);
	return handle;
};

const url = "https://github.com/acme/web/pull/12";
const stamp = new Date("2026-09-01T10:00:00Z");

const rows = async (table: string) =>
	(await h.db.execute(sql`SELECT * FROM ${sql.identifier(table)}`)).rows as Record<string, unknown>[];

// The row as the mapper would write it from a reply with no checks and no
// review, so a refresh with that reply finds the same content hash.
const unchangedContent = {
	owner: "acme",
	repo: "web",
	number: 12,
	url,
	title: "PR 12",
	state: "open",
	isDraft: false,
	headRef: "feature",
	baseRef: "main",
	reviewState: "none",
	mergedAt: null,
	closedAt: null,
	checks: [],
	ciState: "none",
};

const seedLinked = async (overrides: Record<string, unknown>) => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticket = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 1 });
	const pr = await seedPr(h.db, { number: 12 }, { updated_at: stamp, created_at: stamp, ...overrides });
	await linkPr(h.db, ticket, pr);
	return { rootId, ticket, pr };
};

const runRefresh = async (id: string) => {
	const handle = testCtx({ db: h.db, home, gh: createGhRunner() });
	const { delivered, sink } = eventSink();
	const prepared = await prepareRefresh(handle.ctx, { id });
	const { result } = await withTx(h.db, (tx, emit) => refresh(withEmit(handle.ctx, emit), tx, prepared), sink);
	return { result, delivered };
};

describe("pullRequests.refresh", () => {
	test("refresh writes the row when the content hash changes", async () => {
		const { rootId, ticket, pr } = await seedLinked({ content_hash: "stale" });
		stub({
			"api graphql": graphqlReply([
				{ number: 12, title: "Add the board", url, state: "MERGED", checks: [checkRun("test", "SUCCESS", "ci")] },
			]),
		});

		const { result, delivered } = await runRefresh(pr);

		const [row] = await rows("pull_requests");
		expect(row).toMatchObject({ title: "Add the board", state: "merged", ci_state: "pass" });
		expect(row!.content_hash).not.toBe("stale");
		expect(result).toMatchObject({ id: pr, title: "Add the board", state: "merged", ciState: "pass" });
		expect(delivered).toEqual([
			{ type: "pr.updated", id: pr, ticketIds: [ticket], projectIds: [rootId], state: "merged", ciState: "pass" },
		]);
	});

	test("refresh writes nothing when the content hash is the same", async () => {
		const { pr } = await seedLinked({ content_hash: contentHash(unchangedContent) });
		stub({ "api graphql": graphqlReply([{ number: 12, url, headRefName: "feature" }]) });

		const { delivered } = await runRefresh(pr);

		const [row] = await rows("pull_requests");
		expect(new Date(row!.updated_at as string).getTime()).toBe(stamp.getTime());
		expect(row!.content_hash).toBe(contentHash(unchangedContent));
		expect(new Date(row!.fetched_at as string).getTime()).toBeGreaterThan(stamp.getTime());
		expect(delivered).toEqual([]);
	});

	test("refresh with gh down is GH_UNAVAILABLE and changes no row", async () => {
		const { pr } = await seedLinked({ content_hash: "stale", title: "PR 12" });
		stub({
			"api graphql": {
				stdout: "",
				stderr: "To get started with GitHub CLI, please run: gh auth login",
				exitCode: 1,
			},
		});

		const error = await caught(runRefresh(pr));

		expect(error.code).toBe("GH_UNAVAILABLE");
		expect(error.data).toEqual({ reason: "unauthenticated" });
		const [row] = await rows("pull_requests");
		expect(row).toMatchObject({ title: "PR 12", content_hash: "stale", fetched_at: null });
		expect(new Date(row!.updated_at as string).getTime()).toBe(stamp.getTime());
	});

	test("an unknown pull request id is NOT_FOUND", async () => {
		await seedLinked({});
		const handle = stub({ "api graphql": graphqlReply([{ number: 12, url }]) });
		const id = ulid();

		const refreshed = await caught(runRefresh(id));
		expect(refreshed.code).toBe("NOT_FOUND");
		expect(refreshed.data).toEqual({ kind: "pullRequest", ref: id });

		const ctx = testCtx({ db: h.db, home, gh: createGhRunner() }).ctx;
		const diffed = await caught(
			prepareDiff(ctx, { id }).then((prepared) => h.db.transaction((tx) => diff(ctx, tx, prepared))),
		);
		expect(diffed.code).toBe("NOT_FOUND");
		expect(diffed.data).toEqual({ kind: "pullRequest", ref: id });
		expect(handle.spawns()).toEqual([]);
	});
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { checkRun, count, graphqlReply, hoursAgo, navid, seedProject, seedTicket, system } from "../../test/fixtures";
import { eventSink, testCtx, withEmit } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { caught } from "../../test/helpers/errors.ts";
import { ghStub, type StubReply } from "../../test/helpers/gh-stub.ts";
import { freshHomeWithDirs } from "../../test/helpers/home.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import { withTx } from "../db/tx.ts";
import { createGhRunner } from "../gh/run.ts";
import { link, prepareLink } from "./pullRequests.ts";

// link fetches the one pull request through gh and stores it. A second link
// of the same URL on the same ticket answers with the row that is there. A
// gh failure still links the pull request and records the message.

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
	const handle = ghStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-link-")), replies);
	restores.push(handle.restore);
	return handle;
};

const url = "https://github.com/acme/web/pull/12";
const rows = async (table: string) =>
	(await h.db.execute(sql`SELECT * FROM ${sql.identifier(table)}`)).rows as Record<string, unknown>[];

const seedTickets = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const first = await seedTicket(h.db, {
		projectId: rootId,
		rootId,
		statusId: statuses.todo,
		number: 1,
		updatedAt: hoursAgo(5),
	});
	const second = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.todo, number: 2 });
	return { rootId, first, second };
};

const reply = () =>
	graphqlReply([
		{
			number: 12,
			title: "Add the board",
			url,
			reviewDecision: "APPROVED",
			checks: [checkRun("test", "FAILURE", "ci")],
		},
	]);

type LinkInput = { ticket: string; url: string; source?: "manual" | "auto" };

const runLink = async (input: LinkInput, actor = navid) => {
	const handle = testCtx({ db: h.db, home, gh: createGhRunner(), actor });
	const { delivered, sink } = eventSink();
	const prepared = await prepareLink(handle.ctx, input);
	const { result } = await withTx(h.db, (tx, emit) => link(withEmit(handle.ctx, emit), tx, prepared), sink);
	return { result, delivered };
};

describe("pullRequests.link", () => {
	test("link stores the pull request that gh returned", async () => {
		await seedTickets();
		stub({ "api graphql": reply() });

		const { result } = await runLink({ ticket: "CDE-1", url });

		const [row] = await rows("pull_requests");
		expect(row).toMatchObject({
			owner: "acme",
			repo: "web",
			number: 12,
			url,
			title: "Add the board",
			state: "open",
			is_draft: false,
			head_ref: "cde-1-first",
			base_ref: "main",
			review_state: "approved",
			ci_state: "fail",
			fetch_error: null,
		});
		expect(row!.checks).toEqual([
			{ name: "test", workflow: "ci", bucket: "fail", link: "https://github.com/acme/web/runs/test" },
		]);
		expect(row!.content_hash).toBeString();
		expect(row!.fetched_at).not.toBeNull();
		expect(result).toMatchObject({ id: row!.id as string, state: "open", ciState: "fail", source: "manual" });
	});

	test("a second link of one URL on one ticket returns the existing row", async () => {
		await seedTickets();
		const handle = stub({ "api graphql": reply() });

		const first = await runLink({ ticket: "CDE-1", url });
		const second = await runLink({ ticket: "CDE-1", url });

		expect(second.result.id).toBe(first.result.id);
		expect(await count(h.db, "ticket_pull_requests")).toBe(1);
		expect(await count(h.db, "pull_requests")).toBe(1);
		expect(handle.spawns().filter((spawn) => spawn.args[0] === "api")).toHaveLength(2);
	});

	test("one pull request on two tickets is one row and two links", async () => {
		const { first, second } = await seedTickets();
		stub({ "api graphql": reply() });

		const one = await runLink({ ticket: "CDE-1", url });
		const two = await runLink({ ticket: "CDE-2", url });

		expect(two.result.id).toBe(one.result.id);
		expect(await count(h.db, "pull_requests")).toBe(1);
		const links = await rows("ticket_pull_requests");
		expect(links.map((row) => row.ticket_id).sort()).toEqual([first, second].sort());
	});

	test("a gh failure stores fetchError and still links the pull request", async () => {
		await seedTickets();
		stub({ "api graphql": { stdout: "", stderr: "HTTP 500: server error", exitCode: 1 } });

		const { result } = await runLink({ ticket: "CDE-1", url });

		const [row] = await rows("pull_requests");
		expect(row).toMatchObject({ owner: "acme", repo: "web", number: 12, url, state: "open", ci_state: "none" });
		expect(row!.fetch_error).toContain("HTTP 500");
		expect(await count(h.db, "ticket_pull_requests")).toBe(1);
		expect(result.fetchError).toContain("HTTP 500");
	});

	test("link emits pr.linked and records the activity", async () => {
		const { rootId, first } = await seedTickets();
		stub({ "api graphql": reply() });
		const [before] = await rows("tickets");

		const { result, delivered } = await runLink({ ticket: "CDE-1", url });

		const expected = [
			{ type: "pr.linked", id: result.id, ticketIds: [first], projectIds: [rootId], state: "open", ciState: "fail" },
		] satisfies TrellisEvent[];
		expect(delivered.filter((event) => event.type === "pr.linked")).toEqual(expected);
		const activity = await rows("activity");
		expect(activity).toHaveLength(1);
		expect(activity[0]).toMatchObject({ root_id: rootId, ticket_id: first, action: "pr.linked" });
		const after = (await rows("tickets")).find((row) => row.id === first)!;
		expect(new Date(after.updated_at as string).getTime()).toBeGreaterThan(
			new Date(before!.updated_at as string).getTime(),
		);
	});

	test("a link records its source and its actor", async () => {
		await seedTickets();
		stub({ "api graphql": reply() });

		await runLink({ ticket: "CDE-1", url });
		await runLink({ ticket: "CDE-2", url, source: "auto" }, system);

		const links = await rows("ticket_pull_requests");
		expect(links.map((row) => [row.source, row.actor_name, row.actor_kind]).sort()).toEqual([
			["auto", "trellis", "system"],
			["manual", "navid", "human"],
		]);
	});

	test("link refuses an archived project and an unknown ticket", async () => {
		const { rootId } = await seedTickets();
		stub({ "api graphql": reply() });
		await h.db.execute(sql`UPDATE projects SET archived_at = now() WHERE id = ${rootId}`);

		const archived = await caught(runLink({ ticket: "CDE-1", url }));
		expect(archived.code).toBe("PROJECT_ARCHIVED");

		const missing = await caught(runLink({ ticket: "CDE-404", url }));
		expect(missing.code).toBe("NOT_FOUND");
		expect(missing.data).toEqual({ kind: "ticket", ref: "CDE-404" });
		expect(await count(h.db, "pull_requests")).toBe(0);
		expect(await count(h.db, "ticket_pull_requests")).toBe(0);
	});
});

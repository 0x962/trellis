import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { graphqlReply, seedProject, seedRepo, seedTicket } from "../../test/fixtures";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import {
	authReply,
	errorsReply,
	pollerHarness,
	prListReply,
	type StubRepliesInput,
} from "../../test/helpers/poller.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import * as detect from "./detect.ts";
import type { GhResult, GhRunner, GhSlot } from "./run.ts";

// Auto-link lists the open pull requests of each declared repository. A
// failure that belongs to one repository skips that repository only, and
// the log names it once while it keeps failing. A gh that is missing or
// signed out fails every repository alike, so it ends the run.

let h: TestDb;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(() => h.reset());
afterEach(() => h.db.transaction(assertStatusInvariant));
afterAll(() => h.close());

const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});

const harness = (replies: StubRepliesInput) => {
	const p = pollerHarness(h.db, { "auth status": authReply, "api graphql": errorsReply(1), ...replies });
	restores.push(p.restore);
	return p;
};

const linkRows = async () =>
	(
		await h.db.execute(sql`
			SELECT l.ticket_id, p.repo, p.number
			FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
			ORDER BY p.repo, p.number, l.ticket_id
		`)
	).rows as Array<{ ticket_id: string; repo: string; number: number }>;

// The CDE root with the repository acme/web and the ticket CDE-2.
const seedCde = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	await seedRepo(h.db, rootId, "acme", "web");
	const two = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started, number: 2 });
	return { rootId, two };
};

const url = (number: number, repo = "web") => `https://github.com/acme/${repo}/pull/${number}`;

// A gh runner that answers `failure` for every call that names `repo`, and
// hands every other call to `gh`.
const failingFor = (gh: GhRunner, repo: string, failure: GhResult): GhRunner =>
	Object.assign((slot: GhSlot, args: string[]) => (args.includes(repo) ? Promise.resolve(failure) : gh(slot, args)), {
		bin: gh.bin,
		timeoutMs: gh.timeoutMs,
	}) as GhRunner;

const notFoundRepo: GhResult = {
	ok: false,
	reason: "error",
	message: "GraphQL: Could not resolve to a Repository with the name 'acme/aaa'.",
	code: 1,
	stdout: "",
};

describe("detect with a failing repository", () => {
	test("a repository whose pr list fails does not stop the repositories after it", async () => {
		const { rootId, two } = await seedCde();
		await seedRepo(h.db, rootId, "acme", "aaa");
		const p = harness({
			"pr list": prListReply([{ number: 41, url: url(41), headRefName: "cde-2-foo" }]),
			"api graphql": graphqlReply([{ number: 41, url: url(41) }]),
		});

		await detect.run({ ...p.hook, gh: failingFor(p.hook.gh, "acme/aaa", notFoundRepo) });

		expect((await linkRows()).map((row) => [row.repo, row.number, row.ticket_id])).toEqual([["web", 41, two]]);
	});

	test("a failing repository is logged once while it keeps failing", async () => {
		const { rootId } = await seedCde();
		await seedRepo(h.db, rootId, "acme", "aaa");
		const p = harness({ "pr list": prListReply([]) });
		const hook = { ...p.hook, gh: failingFor(p.hook.gh, "acme/aaa", notFoundRepo) };
		const failing = new Map<string, string>();

		await detect.run(hook, failing);
		await detect.run(hook, failing);

		const lines = p.logs.filter((line) => JSON.stringify(line).includes("acme/aaa"));
		expect(lines).toHaveLength(1);
		expect(JSON.stringify(lines[0])).toContain("Could not resolve to a Repository");
	});

	test("an unauthenticated gh stops the run at the first repository", async () => {
		const { rootId } = await seedCde();
		await seedRepo(h.db, rootId, "acme", "aaa");
		const p = harness({ "pr list": prListReply([]) });
		const signedOut: GhResult = { ok: false, reason: "unauthenticated", message: "gh auth login" };
		const calls: string[][] = [];
		const gh = Object.assign(
			(_slot: GhSlot, args: string[]) => {
				calls.push(args);
				return Promise.resolve(signedOut);
			},
			{ bin: "gh", timeoutMs: 0 },
		) as GhRunner;

		await detect.run({ ...p.hook, gh });

		expect(calls).toHaveLength(1);
	});
});

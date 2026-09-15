import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import * as detect from "../../../../src/gh/detect.ts";
import {
	dana,
	graphqlReply,
	linkPr,
	seedActivity,
	seedChild,
	seedPr,
	seedProject,
	seedRepo,
	seedRootWithStatuses,
	seedTicket,
} from "../../../fixtures";
import { freshDb, type TestDb } from "../../../helpers/db.ts";
import { authReply, errorsReply, pollerHarness, prListReply, type StubRepliesInput } from "../../../helpers/poller.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

// Auto-link reads one `gh pr list` per distinct declared repository and
// matches `KEY-number` in the title, the head branch, and the body. The key
// is uppercased before it resolves, so the lowercase branch form `cde-2-foo`
// finds the ticket CDE-2. A link is written as the system actor `trellis`
// with source auto, and the same run fetches the pull request.
//
// The listed url names the repository a pull request lives in. A ticket
// links only when its root project tree declares that repository.

const LIST_ARGS = ["--state", "open", "--limit", "100", "--json", "number,url,title,headRefName,body"];

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

type LinkRow = {
	ticket_id: string;
	source: string;
	actor_name: string;
	actor_kind: string;
	owner: string;
	repo: string;
	number: number;
};

const linkRows = async () =>
	(
		await h.db.execute(sql`
			SELECT l.ticket_id, l.source, l.actor_name, l.actor_kind, p.owner, p.repo, p.number
			FROM ticket_pull_requests l JOIN pull_requests p ON p.id = l.pull_request_id
			ORDER BY p.repo, p.number, l.ticket_id
		`)
	).rows as LinkRow[];

// The CDE root with the repository acme/web and the tickets CDE-2 and CDE-3.
const seedCde = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	await seedRepo(h.db, rootId, "acme", "web");
	const two = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started, number: 2 });
	const three = await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started, number: 3 });
	return { rootId, statuses, two, three };
};

const url = (number: number, repo = "web") => `https://github.com/acme/${repo}/pull/${number}`;

describe("detect", () => {
	test("detect runs one gh pr list per distinct declared repository", async () => {
		const { rootId } = await seedProject(h.db);
		const child = await seedChild(h.db, rootId, rootId, "web");
		const other = await seedRootWithStatuses(h.db, "OPS");
		await seedRepo(h.db, rootId, "acme", "web");
		await seedRepo(h.db, other.rootId, "acme", "api");
		await seedRepo(h.db, child, "acme", "web");
		const p = harness({ "pr list": prListReply([]) });

		await detect.run(p.hook);

		const listed = p.spawnsOf("pr list");
		expect(listed).toHaveLength(2);
		expect(listed.map((spawn) => spawn.args[3]).sort()).toEqual(["acme/api", "acme/web"]);
		for (const spawn of listed) {
			expect(spawn.args.slice(0, 3)).toEqual(["pr", "list", "--repo"]);
			expect(spawn.args.slice(4)).toEqual(LIST_ARGS);
		}
	});

	test("a branch named cde-2-foo links its pull request to CDE-2 as system trellis with source auto", async () => {
		const { two } = await seedCde();
		const p = harness({
			"pr list": prListReply([{ number: 41, url: url(41), headRefName: "cde-2-foo" }]),
			"api graphql": graphqlReply([{ number: 41, url: url(41) }]),
		});

		await detect.run(p.hook);

		expect(await linkRows()).toEqual([
			{
				ticket_id: two,
				source: "auto",
				actor_name: "trellis",
				actor_kind: "system",
				owner: "acme",
				repo: "web",
				number: 41,
			},
		]);
	});

	test("detect matches a key in the title, the branch, or the body", async () => {
		const { two, three } = await seedCde();
		const p = harness({
			"pr list": prListReply([
				{ number: 42, url: url(42), title: "CDE-2 fix the ribbon", headRefName: "feature" },
				{ number: 43, url: url(43), headRefName: "chore", body: "closes cde-3" },
			]),
		});

		await detect.run(p.hook);

		const links = await linkRows();
		expect(links.map((row) => [row.number, row.ticket_id])).toEqual([
			[42, two],
			[43, three],
		]);
	});

	test("one pull request links every ticket its text names", async () => {
		const { two, three } = await seedCde();
		const p = harness({
			"pr list": prListReply([{ number: 44, url: url(44), headRefName: "cde-2-foo", body: "part of cde-3" }]),
		});

		await detect.run(p.hook);

		const links = await linkRows();
		expect(links).toHaveLength(2);
		expect(links.map((row) => row.ticket_id).sort()).toEqual([two, three].sort());
		expect((await h.db.execute(sql`SELECT count(*)::int AS n FROM pull_requests`)).rows[0]!.n).toBe(1);
	});

	test("detect never links a pull request twice", async () => {
		const { rootId, two } = await seedCde();
		const pr = await seedPr(h.db, { number: 45 });
		await linkPr(h.db, two, pr, dana, "manual");
		await seedActivity(h.db, { rootId, projectId: rootId, ticketId: two, action: "pr.linked" });
		const p = harness({ "pr list": prListReply([{ number: 45, url: url(45), headRefName: "cde-2-foo" }]) });

		await detect.run(p.hook);

		const links = await linkRows();
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ source: "manual", actor_name: "dana", actor_kind: "human" });
		const linked = await h.db.execute(sql`SELECT count(*)::int AS n FROM activity WHERE action = 'pr.linked'`);
		expect(linked.rows[0]!.n).toBe(1);
	});

	test("a key and number with no ticket is skipped and the run continues", async () => {
		const { two } = await seedCde();
		const p = harness({
			"pr list": prListReply([
				{ number: 47, url: url(47), headRefName: "cde-99-gone" },
				{ number: 48, url: url(48), headRefName: "cde-2-fix" },
			]),
		});

		await detect.run(p.hook);

		const links = await linkRows();
		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ ticket_id: two, number: 48 });
	});

	test("a match is skipped when the ticket root does not declare that repository", async () => {
		const { rootId, statuses } = await seedProject(h.db);
		await seedRepo(h.db, rootId, "acme", "api");
		await seedTicket(h.db, { projectId: rootId, rootId, statusId: statuses.started, number: 2 });
		const other = await seedRootWithStatuses(h.db, "OPS");
		await seedRepo(h.db, other.rootId, "acme", "web");
		const p = harness({ "pr list": prListReply([{ number: 46, url: url(46), headRefName: "cde-2-foo" }]) });

		await detect.run(p.hook);

		expect(await linkRows()).toEqual([]);
	});

	test("a lowercase key resolves the same ticket as an uppercase key", async () => {
		const { two } = await seedCde();
		const p = harness({
			"pr list": prListReply([
				{ number: 49, url: url(49), title: "CDE-2 upper", headRefName: "feature" },
				{ number: 50, url: url(50), headRefName: "cde-2-foo" },
			]),
		});

		await detect.run(p.hook);

		const links = await linkRows();
		expect(links).toHaveLength(2);
		expect(links.every((row) => row.ticket_id === two)).toBe(true);
	});

	// gh can exit 0 with no output. The repository gets one detect log line
	// that names the command, and the run links nothing and does not throw.
	test("a pr list reply that is not JSON logs the repository and links nothing", async () => {
		await seedCde();
		const p = harness({ "pr list": { stdout: "", stderr: "", exitCode: 0 } });

		await detect.run(p.hook);

		const message = "gh printed output that is not JSON (0 characters) and exited 0: gh pr list";
		expect(p.logs).toEqual([["detect", { repo: "acme/web", ok: false, message }]]);
		expect(await linkRows()).toEqual([]);
	});

	test("a newly linked pull request is fetched in the same run", async () => {
		await seedCde();
		const p = harness({
			"pr list": prListReply([{ number: 51, url: url(51), headRefName: "cde-2-foo" }]),
			"api graphql": graphqlReply([
				{
					number: 51,
					url: url(51),
					title: "Fetched",
					checks: [{ __typename: "StatusContext", context: "ci", state: "SUCCESS" }],
				},
			]),
		});

		await detect.run(p.hook);

		const [row] = (await h.db.execute(sql`SELECT title, state, checks, ci_state, fetch_error FROM pull_requests`)).rows;
		expect(row).toMatchObject({ title: "Fetched", state: "open", ci_state: "pass", fetch_error: null });
		expect(row!.checks).toHaveLength(1);
	});
});

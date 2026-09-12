import { originDir } from "../../../../../../test/originDir.ts";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { ghStub } from "../../../helpers/gh-stub.ts";
import { buildPullRequestQuery, fetchPullRequests } from "../../../../src/gh/graphql.ts";
import { createGhRunner } from "../../../../src/gh/run.ts";

// test/fixtures/graphql-50.json is one `gh api graphql` response for the 50
// refs below: pr0..pr24 in acme/web, pr25..pr49 in acme/api, numbers 100..149.
// Alias prN answers refs[N]; the response carries no owner or repo, so the
// mapper takes them from the ref.
const fixturePath = join(originDir(import.meta.dir), "..", "..", "test", "fixtures", "graphql-50.json");
const fixture = await Bun.file(fixturePath).json();
const refs = Array.from({ length: 50 }, (_, i) => ({ owner: "acme", repo: i < 25 ? "web" : "api", number: 100 + i }));

const scratch = () => mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-graphql-"));
const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});
const stub = (replies: Parameters<typeof ghStub>[1]) => {
	const handle = ghStub(scratch(), replies);
	restores.push(handle.restore);
	return handle;
};

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
// startedAt, event, and createdAt are the fields that rank two nodes of one
// name, so the newest run wins in normalizeChecks.
const selection =
	"{ number title state isDraft url headRefName baseRefName mergedAt closedAt reviewDecision " +
	"commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes { __typename " +
	"... on CheckRun { name status conclusion startedAt detailsUrl checkSuite { workflowRun { event workflow { name } } } } " +
	"... on StatusContext { context state targetUrl createdAt } } } } } } } }";
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("buildPullRequestQuery", () => {
	test("builds one query with 50 distinct aliases and the plan's field selection", () => {
		const query = squash(buildPullRequestQuery(refs));
		expect(query).toMatch(/^(query\b[^{]*)?\{ pr0: /);
		for (const [i, ref] of refs.entries()) {
			const alias = `pr${i}: repository(owner: "${ref.owner}", name: "${ref.repo}") { pullRequest(number: ${ref.number}) ${selection} }`;
			expect(count(query, alias)).toBe(1);
		}
		expect(query.match(/\bpr\d+:/g)).toHaveLength(50);
		expect(new Set(query.match(/\bpr\d+:/g))).toHaveProperty("size", 50);
		expect(count(query, selection)).toBe(50);
	});

	test("builds a one-alias query for a single PR", () => {
		const query = squash(buildPullRequestQuery([refs[7]!]));
		expect(query.match(/\bpr\d+:/g)).toEqual(["pr0:"]);
		expect(query).toContain('pr0: repository(owner: "acme", name: "web") { pullRequest(number: 107)');
	});
});

describe("fetchPullRequests", () => {
	test("fetches 50 PRs with one gh api graphql spawn on a poller slot", async () => {
		const handle = stub({
			"auth status": { stdout: "ok", stderr: "", exitCode: 0, delayMs: 300 },
			"api graphql": { stdout: JSON.stringify(fixture), stderr: "", exitCode: 0 },
		});
		const runGh = createGhRunner();
		const pollers = [runGh("poller", ["auth", "status"]), runGh("poller", ["auth", "status"])];
		await Bun.sleep(100);
		const fetching = fetchPullRequests(runGh, refs);
		await Bun.sleep(100);
		// Both poller slots are held, so the fetch has not spawned yet.
		expect(handle.spawns()).toHaveLength(2);
		await Promise.all(pollers);
		const result = await fetching;
		expect(result).toMatchObject({ ok: true });
		expect((result as { results: unknown[] }).results).toHaveLength(50);
		const graphql = handle.spawns().filter((spawn) => spawn.args[0] === "api");
		expect(graphql).toHaveLength(1);
		expect(graphql[0]!.args).toEqual(["api", "graphql", "-f", `query=${buildPullRequestQuery(refs)}`]);
	});

	test("returns the run failure for the whole batch when gh fails", async () => {
		const handle = stub({
			"api graphql": { stdout: "", stderr: "To get started with GitHub CLI, please run: gh auth login", exitCode: 1 },
		});
		const result = await fetchPullRequests(createGhRunner(), refs);
		expect(result).toMatchObject({ ok: false, reason: "unauthenticated" });
		expect(result).not.toHaveProperty("results");
		expect(handle.spawns()).toHaveLength(1);
	});

	// gh exits 1 when the body carries `errors` and still prints the body to
	// stdout. A body with `data` maps per alias, so one unknown PR number does
	// not fail the other refs in the batch.
	test("maps a per-PR error from an exit 1 body that carries data", async () => {
		const message = "Could not resolve to a PullRequest with the number of 999.";
		const four = refs.slice(0, 4);
		const body = {
			data: { pr0: fixture.data.pr0, pr1: fixture.data.pr1, pr2: fixture.data.pr2, pr3: { pullRequest: null } },
			errors: [{ type: "NOT_FOUND", path: ["pr3", "pullRequest"], message }],
		};
		stub({ "api graphql": { stdout: JSON.stringify(body), stderr: `gh: ${message}`, exitCode: 1 } });
		const result = await fetchPullRequests(createGhRunner(), four);
		expect(result).toMatchObject({ ok: true });
		const results = (result as { results: unknown[] }).results;
		expect(results).toHaveLength(4);
		expect(results[3]).toEqual({ ref: four[3]!, error: message });
		for (const i of [0, 1, 2]) expect(results[i]).toHaveProperty("row");
	});

	// A whole-query rejection carries no usable `data`. GitHub sends `data`
	// null for a rate limit or a 502, and no `data` key for a query error. A
	// 401 or a 403 gives a REST style `message` body. Each one is a batch
	// failure.
	// A rejected token gives an HTTP 401. That failure carries the
	// unauthenticated reason, so the web shows the sign-in banner and not the
	// error banner.
	test("returns the run failure for an exit 1 body without a data object", async () => {
		const bodies: Array<[string, string, Record<string, unknown>]> = [
			[
				'{"data":null,"errors":[{"type":"RATE_LIMITED","message":"API rate limit exceeded"}]}',
				"gh: API rate limit exceeded",
				{ reason: "error", code: 1 },
			],
			[
				'{"errors":[{"path":["query","pr0","x"],"message":"Field \'x\' doesn\'t exist on type \'Repository\'"}]}',
				"gh: Field 'x' doesn't exist on type 'Repository'",
				{ reason: "error", code: 1 },
			],
			[
				'{"message":"Bad credentials","documentation_url":"https://docs.github.com/rest","status":"401"}',
				"gh: Bad credentials (HTTP 401)",
				{ reason: "unauthenticated" },
			],
			[
				'{"message":"API rate limit exceeded for user ID 1.","documentation_url":"https://docs.github.com/rest"}',
				"gh: request failed (HTTP 403)",
				{ reason: "error", code: 1 },
			],
		];
		const handle = stub({ "api graphql": { stdout: "", stderr: "", exitCode: 1 } });
		for (const [stdout, stderr, expected] of bodies) {
			handle.reply("api graphql", { stdout, stderr, exitCode: 1 });
			const result = await fetchPullRequests(createGhRunner(), refs.slice(0, 1));
			const carries = expected.reason === "error" ? { stdout } : {};
			expect(result, stderr).toMatchObject({ ok: false, message: stderr, ...expected, ...carries });
			expect(result, stderr).not.toHaveProperty("results");
		}
		expect(handle.spawns()).toHaveLength(bodies.length);
	});

	// gh can exit 1 with a cut body on stdout when the connection drops in the
	// middle of the response. The cut body is not JSON, so the run failure
	// stands and gh's stderr message reaches the caller.
	test("returns the run failure for an exit 1 body that is cut short", async () => {
		const handle = stub({ "api graphql": { stdout: '{"data":', stderr: "unexpected EOF", exitCode: 1 } });
		const result = await fetchPullRequests(createGhRunner(), refs.slice(0, 1));
		expect(result).toEqual({ ok: false, reason: "error", code: 1, message: "unexpected EOF", stdout: '{"data":' });
		expect(handle.spawns()).toHaveLength(1);
	});

	// GitHub can answer one alias with partial data: a null check node or a
	// null rollup, with an error whose path points into that alias. The alias
	// gets the error, and every other alias in the batch still gets a row.
	test("reports a per-PR error for an alias whose check node is null", async () => {
		const message = "Something went wrong while executing your query.";
		const two = refs.slice(0, 2);
		const pr1 = structuredClone(fixture.data.pr1);
		pr1.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes = [null];
		const body = {
			data: { pr0: fixture.data.pr0, pr1 },
			errors: [
				{
					message,
					path: ["pr1", "pullRequest", "commits", "nodes", 0, "commit", "statusCheckRollup", "contexts", "nodes", 0],
				},
			],
		};
		stub({ "api graphql": { stdout: JSON.stringify(body), stderr: `gh: ${message}`, exitCode: 1 } });
		const result = await fetchPullRequests(createGhRunner(), two);
		expect(result).toMatchObject({ ok: true });
		const results = (result as { results: unknown[] }).results;
		expect(results).toHaveLength(2);
		expect(results[0]).toHaveProperty("row");
		expect(results[1]).toEqual({ ref: two[1]!, error: message });
	});

	// link and refresh fetch one PR on the interactive slot, so a user action
	// never waits behind two in-flight poller batches.
	test("fetches one PR on the interactive slot while both poller slots are busy", async () => {
		const handle = stub({
			"auth status": { stdout: "ok", stderr: "", exitCode: 0, delayMs: 300 },
			"api graphql": { stdout: JSON.stringify({ data: { pr0: fixture.data.pr7 } }), stderr: "", exitCode: 0 },
		});
		const runGh = createGhRunner();
		const pollers = [runGh("poller", ["auth", "status"]), runGh("poller", ["auth", "status"])];
		await Bun.sleep(100);
		const fetching = fetchPullRequests(runGh, [refs[7]!], "interactive");
		await Bun.sleep(100);
		expect(handle.spawns()).toHaveLength(3);
		const result = await fetching;
		expect(result).toMatchObject({ ok: true });
		expect((result as { results: unknown[] }).results).toHaveLength(1);
		await Promise.all(pollers);
	});
});

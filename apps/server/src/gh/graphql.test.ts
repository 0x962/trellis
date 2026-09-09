import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { ghStub } from "../../test/helpers/gh-stub.ts";
import { buildPullRequestQuery, contentHash, fetchPullRequests, mapPullRequestResponse } from "./graphql.ts";
import { deriveCiState } from "./parse.ts";
import { createGhRunner } from "./run.ts";

// test/fixtures/graphql-50.json is one `gh api graphql` response for the 50
// refs below: pr0..pr24 in acme/web, pr25..pr49 in acme/api, numbers 100..149.
// Alias prN answers refs[N]; the response carries no owner or repo, so the
// mapper takes them from the ref.
const fixturePath = join(import.meta.dir, "..", "..", "test", "fixtures", "graphql-50.json");
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
const selection =
	"{ number title state isDraft url headRefName baseRefName mergedAt closedAt reviewDecision " +
	"commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes { __typename " +
	"... on CheckRun { name status conclusion detailsUrl checkSuite { workflowRun { workflow { name } } } } " +
	"... on StatusContext { context state targetUrl } } } } } } } }";
const count = (text: string, needle: string) => text.split(needle).length - 1;
const rowOf = (results: ReturnType<typeof mapPullRequestResponse>, i: number) =>
	(results[i] as { row: Record<string, unknown> }).row;
const rows = () => mapPullRequestResponse(refs, fixture);

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

	// A whole-query rejection carries no usable `data`: GitHub sends `data`
	// null for a rate limit or a 502, no `data` key for a query error, and a
	// REST style `message` body for a 401 or 403. Each one is a batch failure.
	test("returns the run failure for an exit 1 body without a data object", async () => {
		const bodies: Array<[string, string]> = [
			[
				'{"data":null,"errors":[{"type":"RATE_LIMITED","message":"API rate limit exceeded"}]}',
				"gh: API rate limit exceeded",
			],
			[
				'{"errors":[{"path":["query","pr0","x"],"message":"Field \'x\' doesn\'t exist on type \'Repository\'"}]}',
				"gh: Field 'x' doesn't exist on type 'Repository'",
			],
			[
				'{"message":"Bad credentials","documentation_url":"https://docs.github.com/rest","status":"401"}',
				"gh: Bad credentials (HTTP 401)",
			],
			[
				'{"message":"API rate limit exceeded for user ID 1.","documentation_url":"https://docs.github.com/rest"}',
				"gh: request failed (HTTP 403)",
			],
		];
		const handle = stub({ "api graphql": { stdout: "", stderr: "", exitCode: 1 } });
		for (const [stdout, stderr] of bodies) {
			handle.reply("api graphql", { stdout, stderr, exitCode: 1 });
			const result = await fetchPullRequests(createGhRunner(), refs.slice(0, 1));
			expect(result, stderr).toMatchObject({ ok: false, reason: "error", code: 1, message: stderr, stdout });
			expect(result, stderr).not.toHaveProperty("results");
		}
		expect(handle.spawns()).toHaveLength(bodies.length);
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

describe("mapPullRequestResponse", () => {
	test("maps an open draft PR with lowercased state, refs, and null dates", () => {
		expect(rowOf(rows(), 0)).toMatchObject({
			owner: "acme",
			repo: "web",
			number: 100,
			url: "https://github.com/acme/web/pull/100",
			title: "PR 100 in web",
			state: "open",
			isDraft: true,
			headRef: "cde-42-slug",
			baseRef: "main",
			mergedAt: null,
			closedAt: null,
		});
	});

	test("maps MERGED and CLOSED states and keeps ISO dates", () => {
		const results = rows();
		expect(rowOf(results, 1)).toMatchObject({
			state: "merged",
			mergedAt: "2026-09-08T10:00:00Z",
			closedAt: "2026-09-08T10:00:00Z",
		});
		expect(rowOf(results, 2)).toMatchObject({ state: "closed", mergedAt: null, closedAt: "2026-09-07T09:00:00Z" });
	});

	test("maps reviewDecision to reviewState with null as none", () => {
		const results = rows();
		expect(rowOf(results, 0).reviewState).toBe("none");
		expect(rowOf(results, 3).reviewState).toBe("review_required");
		expect(rowOf(results, 1).reviewState).toBe("approved");
		expect(rowOf(results, 2).reviewState).toBe("changes_requested");
	});

	test("sorts checks by workflow then name with null workflow first", () => {
		const link = (name: string) => `https://github.com/acme/ci/actions/runs/${name}`;
		expect(rowOf(rows(), 4).checks).toEqual([
			{ name: "lint", workflow: null, bucket: "pass", link: link("lint") },
			{ name: "build", workflow: "ci", bucket: "pass", link: link("build") },
			{ name: "test", workflow: "ci", bucket: "pass", link: link("test") },
			{ name: "a", workflow: "deploy", bucket: "pass", link: link("a") },
		]);
	});

	test("maps a StatusContext to a check with a null workflow", () => {
		expect(rowOf(rows(), 7).checks).toEqual([
			{ name: "license/cla", workflow: null, bucket: "pass", link: "https://x" },
		]);
	});

	test("maps a PR without a rollup to empty checks and ciState none", () => {
		const results = rows();
		for (const i of [5, 6]) {
			expect(rowOf(results, i).checks).toEqual([]);
			expect(rowOf(results, i).ciState).toBe("none");
		}
	});

	test("sets ciState from the mapped checks", () => {
		const results = rows();
		expect(rowOf(results, 8).ciState).toBe("fail");
		for (let i = 0; i < 50; i++) {
			const row = rowOf(results, i) as { checks: Parameters<typeof deriveCiState>[0]; ciState: string };
			expect(row.ciState).toBe(deriveCiState(row.checks));
		}
	});

	test("content_hash is stable across key order and check input order", () => {
		const { contentHash: hash, ...fields } = rowOf(rows(), 4) as { contentHash: string; checks: object[] };
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(contentHash(fields)).toBe(hash);
		const reversedKeys = Object.fromEntries(Object.entries(fields).reverse());
		reversedKeys.checks = fields.checks.map((check) => Object.fromEntries(Object.entries(check).reverse()));
		expect(contentHash(reversedKeys)).toBe(hash);
		const reordered = structuredClone(fixture);
		reordered.data.pr4.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes.reverse();
		expect(rowOf(mapPullRequestResponse(refs, reordered), 4).contentHash).toBe(hash);
	});

	test("content_hash changes when a check bucket or a field changes", () => {
		const { contentHash: hash, ...fields } = rowOf(rows(), 4) as { contentHash: string; checks: object[] };
		const pending = structuredClone(fields) as { checks: Array<{ bucket: string }> };
		pending.checks[0]!.bucket = "pending";
		expect(contentHash(pending)).not.toBe(hash);
		expect(contentHash({ ...fields, title: "Renamed" })).not.toBe(hash);
	});

	test("reports a per-PR error for an alias whose rollup is null under an error path", () => {
		const message = "Something went wrong while executing your query.";
		const two = refs.slice(0, 2);
		const pr1 = structuredClone(fixture.data.pr1);
		pr1.pullRequest.commits.nodes[0].commit.statusCheckRollup = null;
		const response = {
			data: { pr0: fixture.data.pr0, pr1 },
			errors: [{ message, path: ["pr1", "pullRequest", "commits", "nodes", 0, "commit", "statusCheckRollup"] }],
		};
		const results = mapPullRequestResponse(two, response);
		expect(results).toHaveLength(2);
		expect(results[0]).toHaveProperty("row");
		expect(results[1]).toEqual({ ref: two[1]!, error: message });
	});

	test("reports a per-PR error for an alias GitHub could not resolve", () => {
		const message = "Could not resolve to a PullRequest with the number of 999.";
		const four = refs.slice(0, 4);
		const response = {
			data: {
				pr0: fixture.data.pr0,
				pr1: fixture.data.pr1,
				pr2: fixture.data.pr2,
				pr3: { pullRequest: null },
			},
			errors: [{ message, path: ["pr3", "pullRequest"] }],
		};
		const results = mapPullRequestResponse(four, response);
		expect(results).toHaveLength(4);
		expect(results[3]).toEqual({ ref: four[3]!, error: message });
		for (const i of [0, 1, 2]) {
			expect(results[i]).toHaveProperty("ref", four[i]);
			expect(results[i]).toHaveProperty("row");
		}
	});
});

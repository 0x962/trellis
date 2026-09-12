import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";
import { contentHash, mapPullRequestResponse } from "../../../../src/gh/graphql.ts";
import { deriveCiState } from "../../../../src/gh/parse.ts";

// test/fixtures/graphql-50.json is one `gh api graphql` response for the 50
// refs below: pr0..pr24 in acme/web, pr25..pr49 in acme/api, numbers 100..149.
// Alias prN answers refs[N]; the response carries no owner or repo, so the
// mapper takes them from the ref.
const fixturePath = join(originDir(import.meta.dir), "..", "..", "test", "fixtures", "graphql-50.json");
const fixture = await Bun.file(fixturePath).json();
const refs = Array.from({ length: 50 }, (_, i) => ({ owner: "acme", repo: i < 25 ? "web" : "api", number: 100 + i }));

const rowOf = (results: ReturnType<typeof mapPullRequestResponse>, i: number) =>
	(results[i] as { row: Record<string, unknown> }).row;
const rows = () => mapPullRequestResponse(refs, fixture);

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

	// GitHub keeps a re-run beside the run it replaces, so one response holds
	// two nodes named test. The row keeps the newest node only, so ci_state
	// follows the re-run and not the run it replaced.
	test("keeps the newest of two runs of one name and reports the row once", () => {
		const pr4 = structuredClone(fixture.data.pr4);
		const nodes = pr4.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes;
		nodes[0].startedAt = "2026-09-07T06:55:14Z";
		nodes.push({ ...structuredClone(nodes[0]), conclusion: "FAILURE", startedAt: "2026-09-07T07:40:41Z" });
		const results = mapPullRequestResponse(refs.slice(0, 5), { data: { ...fixture.data, pr4 } });
		const row = rowOf(results, 4);
		const checks = row.checks as Array<Record<string, unknown>>;
		expect(checks.filter((entry) => entry.name === "test")).toEqual([
			{ name: "test", workflow: "ci", bucket: "fail", link: "https://github.com/acme/ci/actions/runs/test" },
		]);
		expect(row.ciState).toBe("fail");
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

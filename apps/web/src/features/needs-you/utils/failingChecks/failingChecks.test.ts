import { describe, expect, test } from "bun:test";
import type { Check, CheckBucket, LinkedPullRequest, PrState } from "@trellis/api";
import { failingChecks } from "./failingChecks";

const check = (name: string, bucket: CheckBucket): Check => ({ name, workflow: "CI", bucket, link: null });

const pr = (number: number, state: PrState, checks: Check[]): LinkedPullRequest => ({
	id: `01J8Z6X4Q3M2K1H0G9F8E7D6R${number}`,
	owner: "canary-technologies-corp",
	repo: "de",
	number,
	url: `https://github.com/canary-technologies-corp/de/pull/${number}`,
	title: "Fix the terminal pane",
	state,
	isDraft: false,
	headRef: "cde-44-scrollback",
	baseRef: "main",
	reviewState: "none",
	mergedAt: state === "merged" ? "2026-09-08T10:00:00.000Z" : null,
	closedAt: null,
	checks,
	ciState: checks.some((entry) => entry.bucket === "fail") ? "fail" : "pass",
	fetchedAt: "2026-09-09T10:00:00.000Z",
	fetchError: null,
	createdAt: "2026-09-07T10:00:00.000Z",
	updatedAt: "2026-09-09T10:00:00.000Z",
	source: "auto",
	linkedBy: { name: "trellis", kind: "system" },
	linkedAt: "2026-09-07T10:00:00.000Z",
});

describe("failingChecks", () => {
	// NY-33. A merged pull request needs no work, so its old failure stays
	// out of the re-run command.
	test("names only the failing checks of the open pull request", () => {
		const open = pr(121, "open", [
			check("lint", "pass"),
			check("build (macos-arm64)", "pending"),
			check("typecheck (desktop)", "fail"),
		]);
		const merged = pr(118, "merged", [check("test (host-service)", "fail")]);
		expect(failingChecks([open, merged])).toEqual(["typecheck (desktop)"]);
	});

	test("returns an empty list when every open check passes", () => {
		expect(failingChecks([pr(118, "open", [check("lint", "pass")])])).toEqual([]);
	});
});

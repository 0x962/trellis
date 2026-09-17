import { describe, expect, test } from "bun:test";
import { reviewerCandidates, reviewerRequestArgs } from "./reviewers";

describe("reviewerCandidates", () => {
	test("flattens pages and excludes bots", () => {
		expect(
			reviewerCandidates([
				[
					{ login: "ada", avatar_url: "https://example.com/ada", type: "User" },
					{ login: "ci-bot", avatar_url: "https://example.com/bot", type: "Bot" },
				],
				[{ login: "grace", avatar_url: "https://example.com/grace", type: "User" }],
			]),
		).toEqual([
			{ login: "ada", avatarUrl: "https://example.com/ada" },
			{ login: "grace", avatarUrl: "https://example.com/grace" },
		]);
	});
});

describe("reviewerRequestArgs", () => {
	test("adds and removes one reviewer through the GitHub API", () => {
		const ref = { owner: "acme", repo: "web", number: 42 };
		expect(reviewerRequestArgs(ref, { reviewer: "ada", remove: false })).toEqual([
			"api",
			"--method",
			"POST",
			"repos/acme/web/pulls/42/requested_reviewers",
			"-f",
			"reviewers[]=ada",
		]);
		expect(reviewerRequestArgs(ref, { reviewer: "ada", remove: true })[2]).toBe("DELETE");
	});
});

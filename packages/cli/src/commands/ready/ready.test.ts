import { expect, test } from "bun:test";
import type { TrellisClient } from "@trellis/api/client";
import type { PullRequestReadiness } from "./pullRequestReady.ts";
import { markPullRequestReady } from "./ready.ts";

const readiness = (isDraft: boolean): PullRequestReadiness => ({
	dataModelDiagramRequired: false,
	pullRequest: { number: 131, url: "https://github.com/acme/trellis/pull/131", headSha: "abc123", isDraft },
	flows: { flows: [], runs: [], waived: null, satisfied: true },
	waitingOn: [],
	missing: [],
	ready: true,
});

test("clears the GitHub draft flag before it records that the agent asked for review", async () => {
	const calls: string[] = [];
	const client = {
		reviews: {
			action: async () => {
				calls.push("github");
			},
		},
		pullRequests: {
			setLocalState: async () => {
				calls.push("local");
			},
		},
	} as unknown as TrellisClient;

	await markPullRequestReady(
		client,
		{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
		readiness(true),
	);

	expect(calls).toEqual(["github", "local"]);
});

test("leaves the Trellis state unchanged when the GitHub ready action fails", async () => {
	const calls: string[] = [];
	const client = {
		reviews: {
			action: async () => {
				calls.push("github");
				throw new Error("GitHub rejected the action.");
			},
		},
		pullRequests: {
			setLocalState: async () => {
				calls.push("local");
			},
		},
	} as unknown as TrellisClient;

	await expect(
		markPullRequestReady(
			client,
			{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
			readiness(true),
		),
	).rejects.toThrow("GitHub rejected the action.");

	expect(calls).toEqual(["github"]);
});

test("writes the Trellis ready state when the pull request is ready", async () => {
	const calls: string[] = [];
	const client = {
		reviews: {
			action: async () => {
				calls.push("github");
			},
		},
		pullRequests: {
			setLocalState: async () => {
				calls.push("local");
			},
		},
	} as unknown as TrellisClient;

	await markPullRequestReady(
		client,
		{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
		readiness(false),
	);

	expect(calls).toEqual(["local"]);
});

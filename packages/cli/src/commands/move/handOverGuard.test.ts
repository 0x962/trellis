import { expect, test } from "bun:test";
import type { TrellisClient } from "@trellis/api/client";
import { handOverGuard } from "./handOverGuard.ts";

const risk = {
	api: "no" as const,
	cli: "no" as const,
	background: "no" as const,
	auth: "no" as const,
	migration: "no" as const,
	dependency: "no" as const,
	sharedType: "no" as const,
	deletedTest: "no" as const,
};

const humanReviewId = "01M24QC2CQ8T155DMRNRMF3E8T";
const linked = { id: "01M30HDWKZ17G62PJAFHZNED2J", number: 42, url: "https://github.com/acme/roadmap/pull/42" };

const clientWith = ({
	evidenceRows,
	pullRequestState = "open",
	summaryHead,
}: {
	evidenceRows: Array<{ kind: string; headSha: string }>;
	pullRequestState?: "open" | "closed" | "merged";
	summaryHead: { body: string } | null;
}): TrellisClient =>
	({
		tickets: {
			get: async () => ({
				identifier: "KEY-42",
				title: "Add the hand-over guard",
				project: { path: "KEY" },
				contract: { verify: ["bun test"] },
				prs: [{ ...linked, state: pullRequestState }],
			}),
		},
		statuses: {
			list: async () => ({
				statuses: [{ id: humanReviewId, slug: "human-review", name: "Human Review", category: "review" }],
			}),
		},
		pullRequests: {
			listEvidence: async () => evidenceRows,
			readSummaryHead: async () => summaryHead,
		},
		reviews: {
			status: async () => ({
				headRefOid: "head-sha",
				prRow: {
					kind: "backend",
					risk,
					evidence: evidenceRows.length + (summaryHead === null ? 0 : 1),
					evidenceRequired: 3,
					evidenceMissing: [],
					pass: 1,
					fail: 0,
					pending: 0,
					skipped: 0,
					failedChecks: [],
				},
			}),
		},
	}) as unknown as TrellisClient;

test("allows another target without evidence checks", async () => {
	const client = clientWith({ evidenceRows: [], summaryHead: null });

	expect(await handOverGuard(client, "agent", "KEY-42", "Done")).toBeNull();
});

test("allows an agent hand-over with no linked pull request", async () => {
	const client = {
		tickets: { get: async () => ({ project: { path: "KEY" }, prs: [] }) },
		statuses: {
			list: async () => ({
				statuses: [{ id: humanReviewId, slug: "human-review", name: "Human Review", category: "review" }],
			}),
		},
	} as unknown as TrellisClient;

	expect(await handOverGuard(client, "agent", "KEY-42", "human-review")).toBeNull();
});

test("refuses an agent with the evidence check list for an incomplete floor", async () => {
	for (const statusRef of ["human-review", "Human Review", "Human-Review", "category:review", humanReviewId]) {
		const missing = await handOverGuard(
			clientWith({ evidenceRows: [], summaryHead: null }),
			"agent",
			"KEY-42",
			statusRef,
		);

		expect(missing?.blocksAgent).toBe(true);
		expect(missing?.result.complete).toBe(false);
		expect(missing?.result.items.map((item) => item.status)).toEqual(["MISSING", "MISSING", "MISSING"]);
	}
});

test("shows the evidence check list to a human without a refusal", async () => {
	const missing = await handOverGuard(
		clientWith({ evidenceRows: [], summaryHead: null }),
		"human",
		"KEY-42",
		humanReviewId,
	);

	expect(missing?.blocksAgent).toBe(false);
	expect(missing?.result.complete).toBe(false);
});

test("ignores a closed pull request", async () => {
	expect(
		await handOverGuard(
			clientWith({ evidenceRows: [], pullRequestState: "closed", summaryHead: null }),
			"agent",
			"KEY-42",
			"human-review",
		),
	).toBeNull();
});

test("allows an agent hand-over with a complete floor", async () => {
	const rows = [
		{ kind: "call", headSha: "head-sha", record: { status: 200 } },
		{ kind: "call", headSha: "head-sha", record: { status: 400 } },
	];

	expect(
		await handOverGuard(
			clientWith({ evidenceRows: rows, summaryHead: { body: "summary" } }),
			"agent",
			"KEY-42",
			"category:review",
		),
	).toBeNull();
});

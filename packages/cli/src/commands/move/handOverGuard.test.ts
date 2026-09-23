import { expect, test } from "bun:test";
import type { TrellisClient } from "@trellis/api/client";
import { handOverGuard } from "./handOverGuard.ts";

const humanReviewId = "01M24QC2CQ8T155DMRNRMF3E8T";
const linked = { id: "01M30HDWKZ17G62PJAFHZNED2J", number: 42, url: "https://github.com/acme/roadmap/pull/42" };

const clientWith = ({
	evidence,
	files = [],
	flows = [],
	runs = [],
	pullRequestState = "open",
	summaryHead,
}: {
	evidence: { body: string } | null;
	files?: Array<{ path: string; change: "change"; additions: number; deletions: number }>;
	flows?: Array<{ slug: string; name: string; description: string }>;
	runs?: Array<{ slug: string; status: string }>;
	pullRequestState?: "open" | "closed" | "merged";
	summaryHead: { headline: string } | null;
}): TrellisClient =>
	({
		tickets: {
			get: async () => ({
				identifier: "KEY-42",
				title: "Add the hand-over guard",
				project: { path: "KEY" },
				prs: [{ ...linked, state: pullRequestState }],
			}),
		},
		statuses: {
			list: async () => ({
				statuses: [{ id: humanReviewId, slug: "human-review", name: "Human Review", category: "review" }],
			}),
		},
		pullRequests: {
			refresh: async () => ({ number: linked.number, files, reviewGaps: [{ kind: "not-asked", count: 1 }] }),
			readEvidence: async () => (evidence === null ? null : { ...evidence, headSha: "head-sha" }),
			readFlowWaiver: async () => null,
			readSummaryHead: async () => (summaryHead === null ? null : { why: "Why.", watch: "nothing", ...summaryHead }),
		},
		reviews: { status: async () => ({ headRefOid: "head-sha", ticket: { identifier: "KEY-42" } }) },
		flows: { list: async () => flows },
		flowExecutions: {
			list: async () =>
				runs.map((run) => ({ doc: { flow: { slug: run.slug, name: run.slug } }, state: { status: run.status } })),
		},
	}) as unknown as TrellisClient;

test("allows another target without a readiness check", async () => {
	const client = clientWith({ evidence: null, summaryHead: null });

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

test("refuses an agent and names both missing parts", async () => {
	for (const statusRef of ["human-review", "Human Review", "Human-Review", "category:review", humanReviewId]) {
		const missing = await handOverGuard(
			clientWith({ evidence: null, summaryHead: null }),
			"agent",
			"KEY-42",
			statusRef,
		);

		expect(missing?.blocksAgent).toBe(true);
		expect(missing?.result.missing).toEqual(["explanation", "evidence"]);
	}
});

test("shows the missing parts to a human without a refusal", async () => {
	const missing = await handOverGuard(
		clientWith({ evidence: null, summaryHead: null }),
		"human",
		"KEY-42",
		humanReviewId,
	);

	expect(missing?.blocksAgent).toBe(false);
	expect(missing?.result.ready).toBe(false);
});

test("ignores a closed pull request", async () => {
	expect(
		await handOverGuard(
			clientWith({ evidence: null, pullRequestState: "closed", summaryHead: null }),
			"agent",
			"KEY-42",
			"human-review",
		),
	).toBeNull();
});

test("refuses an agent whose pull request has the explanation but no evidence document", async () => {
	const missing = await handOverGuard(
		clientWith({ evidence: null, summaryHead: { headline: "A row opens the ticket." } }),
		"agent",
		"KEY-42",
		"human-review",
	);

	expect(missing?.result.missing).toEqual(["evidence"]);
});

test("refuses an agent whose data model pull request has no ER diagram", async () => {
	const missing = await handOverGuard(
		clientWith({
			evidence: { body: "## Proof" },
			files: [{ path: "backend/operator/migrations/0004_briefing.py", change: "change", additions: 12, deletions: 0 }],
			summaryHead: { headline: "A row opens the ticket." },
		}),
		"agent",
		"KEY-42",
		"human-review",
	);

	expect(missing?.result.missing).toEqual(["data-model-diagram"]);
});

test("allows an agent hand-over with the explanation and the evidence document", async () => {
	expect(
		await handOverGuard(
			clientWith({ evidence: { body: "## Proof" }, summaryHead: { headline: "A row opens the ticket." } }),
			"agent",
			"KEY-42",
			"category:review",
		),
	).toBeNull();
});

test("refuses an agent hand-over with no flow run on the current head", async () => {
	const client = clientWith({
		evidence: { body: "Proof." },
		summaryHead: { headline: "Add the guard." },
		flows: [{ slug: "review", name: "Review", description: "Read the diff." }],
	});

	const refusal = await handOverGuard(client, "agent", "KEY-42", "human-review");

	expect(refusal?.result.missing).toEqual(["flow-run"]);
	expect(refusal?.blocksAgent).toBe(true);
});

test("allows a person hand-over while no flow ran", async () => {
	const client = clientWith({
		evidence: { body: "Proof." },
		summaryHead: { headline: "Add the guard." },
		flows: [{ slug: "review", name: "Review", description: "Read the diff." }],
	});

	expect(await handOverGuard(client, "human", "KEY-42", "human-review")).toBeNull();
});

test("allows an agent hand-over once a flow ran on the current head", async () => {
	const client = clientWith({
		evidence: { body: "Proof." },
		summaryHead: { headline: "Add the guard." },
		flows: [{ slug: "review", name: "Review", description: "Read the diff." }],
		runs: [{ slug: "review", status: "succeeded" }],
	});

	expect(await handOverGuard(client, "agent", "KEY-42", "human-review")).toBeNull();
});

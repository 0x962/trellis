import { expect, test } from "bun:test";
import type { TrellisClient } from "@trellis/api/client";
import {
	type PullRequestReadiness,
	pullRequestReadiness,
	pullRequestReadyText,
	pullRequestWaitingText,
} from "./pullRequestReady.ts";

const readiness = (
	missing: PullRequestReadiness["missing"],
	dataModelDiagramRequired = false,
	storedGaps: PullRequestReadiness["storedGaps"] = [],
): PullRequestReadiness => ({
	dataModelDiagramRequired,
	pullRequest: { number: 131, url: "https://github.com/acme/trellis/pull/131", headSha: "abc123", isDraft: false },
	flows: { flows: [], runs: [], waived: null, skipped: null, satisfied: true },
	missing,
	ready: missing.length === 0,
	storedGaps,
});

test("names each missing part with its command", () => {
	expect(pullRequestReadyText(readiness(["explanation", "evidence"]))).toBe(
		`#131 is not ready for review. Add each missing item, then run: trellis ready 131
  MISSING  explanation  trellis summary write 131 --headline "..." --why - --watch "..."
  MISSING  evidence     trellis evidence write 131 --body -
`,
	);
});

test("names only the evidence document when the explanation exists", () => {
	expect(pullRequestReadyText(readiness(["evidence"]))).toBe(
		`#131 is not ready for review. Add each missing item, then run: trellis ready 131
  MISSING  evidence  trellis evidence write 131 --body -
`,
	);
});

test("names the missing data model diagram and tells the agent how to add it", () => {
	expect(pullRequestReadyText(readiness(["data-model-diagram"], true))).toBe(
		`#131 is not ready for review. Add each missing item, then run: trellis ready 131
  MISSING  data model diagram  add a \`\`\`mermaid erDiagram\`\`\` block to the explanation or evidence document
`,
	);
});

test("names each flow with the command that runs it when no flow ran", () => {
	const result = readiness(["flow-run"]);
	result.flows = {
		flows: [
			{ slug: "review", name: "Review", description: "Read the diff." },
		] as PullRequestReadiness["flows"]["flows"],
		runs: [],
		waived: null,
		skipped: null,
		satisfied: false,
	};

	expect(pullRequestReadyText(result)).toBe(
		`#131 is not ready for review. Add each missing item, then run: trellis ready 131
  MISSING  flow run  no flow ran for this pull request
    Pick the flows that fit this change and run each one:
    review  Read the diff.  trellis flows run 131 --flow review
    A flow that does not fit this change is answered in one step. Write the reason in the
    evidence document, then record it here:
      trellis ready 131 --flow-does-not-apply "<reason>"
`,
	);
});

test("says the pull request is ready when both parts exist", () => {
	expect(pullRequestReadyText(readiness([]))).toBe(
		"#131 is ready for review. It has the explanation and the evidence document. Trellis marked it ready for review.\n",
	);
});

test("names what the pull request still waits for after the agent asked for review", () => {
	const result = readiness([], false, [
		{ kind: "checks-pending", count: 2 },
		{ kind: "findings", count: 1 },
	]);

	expect(pullRequestReadyText(result)).toBe(
		`#131 is not ready for review yet. It has the explanation and the evidence document, and Trellis recorded that you asked for review. It turns green for the person when this is true as well:
  MISSING  2 checks pending
  MISSING  1 review finding open
`,
	);
});

test("tells the agent that a linked pull request waits until trellis ready", () => {
	expect(pullRequestWaitingText(131)).toBe(
		"#131 waits in Trellis. When the work is complete and you want the person to review it, run: trellis ready 131\n",
	);
});

const clientWith = ({
	evidence,
	files,
	summaryHead,
	flows = [],
	runs = [],
	evidenceHead = "abc123",
}: {
	evidence: { body: string } | null;
	// The commit the stored evidence document proves. It matches the head the
	// test uses unless a test states an older one.
	evidenceHead?: string;
	files: Array<{ path: string; change: "change"; additions: number; deletions: number }> | null;
	summaryHead: { headline: string; why: string; watch: string } | null;
	flows?: Array<{ slug: string; name: string; description: string }>;
	// `headSha` is the commit the run read. A run of an older commit answers
	// the check the same way a run of the current head does.
	runs?: Array<{ slug: string; status: string; headSha?: string }>;
}): TrellisClient =>
	({
		pullRequests: {
			refresh: async () => ({ number: 131, files, isDraft: false, reviewGaps: [{ kind: "not-asked", count: 1 }] }),
			readEvidence: async () => (evidence === null ? null : { ...evidence, headSha: evidenceHead }),
			readFlowWaiver: async () => null,
			readSummaryHead: async () => summaryHead,
		},
		reviews: { status: async () => ({ headRefOid: "abc123", ticket: { identifier: "OP-74" } }) },
		flows: { list: async () => flows },
		flowExecutions: {
			list: async () =>
				runs.map((run) => ({
					doc: { flow: { slug: run.slug, name: run.slug } },
					headSha: run.headSha ?? "abc123",
					state: { status: run.status },
				})),
		},
	}) as unknown as TrellisClient;

test("requires an ER diagram when the pull request changes a data model", async () => {
	const result = await pullRequestReadiness(
		clientWith({
			evidence: { body: "Proof." },
			files: [{ path: "db/migrations/202609221628_add_briefings.sql", change: "change", additions: 8, deletions: 0 }],
			summaryHead: { headline: "Add briefings.", why: "The table stores them.", watch: "db/migrations" },
		}),
		{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
		{ checkFlows: false },
	);

	expect(result.dataModelDiagramRequired).toBe(true);
	expect(result.missing).toEqual(["data-model-diagram"]);
});

test("accepts an ER diagram in the explanation or the evidence document", async () => {
	const result = await pullRequestReadiness(
		clientWith({
			evidence: { body: "```mermaid\nerDiagram\n  BRIEFING ||--o{ MESSAGE : has\n```" },
			files: [{ path: "backend/operator/models.py", change: "change", additions: 8, deletions: 0 }],
			summaryHead: { headline: "Add briefings.", why: "The table stores them.", watch: "backend/operator/models.py" },
		}),
		{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
		{ checkFlows: false },
	);

	expect(result.ready).toBe(true);
});

const written = {
	evidence: { body: "Proof." },
	files: [{ path: "docs/README.md", change: "change" as const, additions: 1, deletions: 0 }],
	summaryHead: { headline: "Add the step.", why: "The agent skipped it.", watch: "nothing" },
};

test("asks an agent for a flow run when the server holds a flow", async () => {
	const result = await pullRequestReadiness(
		clientWith({ ...written, flows: [{ slug: "review", name: "Review", description: "Read the diff." }] }),
		{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
		{ checkFlows: true },
	);

	expect(result.missing).toEqual(["flow-run"]);
});

test("takes a succeeded run as the flow run", async () => {
	const result = await pullRequestReadiness(
		clientWith({
			...written,
			flows: [{ slug: "review", name: "Review", description: "Read the diff." }],
			runs: [{ slug: "review", status: "succeeded" }],
		}),
		{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
		{ checkFlows: true },
	);

	expect(result.ready).toBe(true);
	expect(pullRequestReadyText(result)).toBe(
		"#131 is ready for review. It has the explanation, the evidence document, and a flow run. Trellis marked it ready for review.\n",
	);
});

// One flow run answers for the whole pull request. The agent pushed three
// more commits after the run, and Trellis asks for no second run.
test("keeps the flow run after three later commits", async () => {
	const result = await pullRequestReadiness(
		clientWith({
			...written,
			flows: [{ slug: "review", name: "Review", description: "Read the diff." }],
			runs: [{ slug: "review", status: "succeeded", headSha: "first1" }],
		}),
		{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
		{ checkFlows: true },
	);

	expect(result.missing).toEqual([]);
	expect(result.ready).toBe(true);
});

test("asks a caller that checks no flow for nothing new", async () => {
	const result = await pullRequestReadiness(
		clientWith({ ...written, flows: [{ slug: "review", name: "Review", description: "Read the diff." }] }),
		{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
		{ checkFlows: false },
	);

	expect(result.ready).toBe(true);
});

// The evidence document names the commit it proves. A push takes it away the
// way it takes the explanation away.
test("asks for the evidence document again after a push", async () => {
	const result = await pullRequestReadiness(
		clientWith({ ...written, evidenceHead: "older" }),
		{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
		{ checkFlows: false },
	);

	expect(result.missing).toEqual(["evidence"]);
});

test("refuses a run that stopped and waits", async () => {
	const result = await pullRequestReadiness(
		clientWith({
			...written,
			flows: [{ slug: "review", name: "Review", description: "Read the diff." }],
			runs: [{ slug: "review", status: "waiting" }],
		}),
		{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
		{ checkFlows: true },
	);

	expect(result.ready).toBe(false);
	expect(result.missing).toEqual(["flow-run"]);
});

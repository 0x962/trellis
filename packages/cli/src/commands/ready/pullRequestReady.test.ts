import { expect, test } from "bun:test";
import type { TrellisClient } from "@trellis/api/client";
import {
	type PullRequestReadiness,
	pullRequestDraftText,
	pullRequestReadiness,
	pullRequestReadyText,
} from "./pullRequestReady.ts";

const readiness = (
	missing: PullRequestReadiness["missing"],
	dataModelDiagramRequired = false,
): PullRequestReadiness => ({
	dataModelDiagramRequired,
	pullRequest: { number: 131, url: "https://github.com/acme/trellis/pull/131", headSha: "abc123" },
	missing,
	ready: missing.length === 0,
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

test("says the pull request is ready when both parts exist", () => {
	expect(pullRequestReadyText(readiness([]))).toBe(
		"#131 is ready for review. It has the explanation and the evidence document. The person will now review it.\n",
	);
});

test("tells the agent that a linked pull request is a draft until trellis ready", () => {
	expect(pullRequestDraftText(131)).toBe(
		"#131 is a draft. When the work is complete and you want the person to review it, run: trellis ready 131\n",
	);
});

const clientWith = ({
	evidence,
	files,
	summaryHead,
}: {
	evidence: { body: string } | null;
	files: Array<{ path: string; change: "change"; additions: number; deletions: number }> | null;
	summaryHead: { headline: string; why: string; watch: string } | null;
}): TrellisClient =>
	({
		pullRequests: {
			refresh: async () => ({ number: 131, files }),
			readEvidence: async () => evidence,
			readSummaryHead: async () => summaryHead,
		},
		reviews: { status: async () => ({ headRefOid: "abc123" }) },
	}) as unknown as TrellisClient;

test("requires an ER diagram when the pull request changes a data model", async () => {
	const result = await pullRequestReadiness(
		clientWith({
			evidence: { body: "Proof." },
			files: [{ path: "db/migrations/202609221628_add_briefings.sql", change: "change", additions: 8, deletions: 0 }],
			summaryHead: { headline: "Add briefings.", why: "The table stores them.", watch: "db/migrations" },
		}),
		{ id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" },
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
	);

	expect(result.ready).toBe(true);
});

import type { RawContext } from "../../src/gh/parse.ts";

// One `gh api graphql` response body for the pull requests a link or a
// refresh asks for. Alias prN answers refs[N], as the poller's query builds
// them. The body carries no owner and no repo, so the row takes both from
// the ref.

export type PrFixture = {
	number: number;
	title?: string;
	state?: "OPEN" | "CLOSED" | "MERGED";
	isDraft?: boolean;
	url?: string;
	headRefName?: string;
	baseRefName?: string;
	mergedAt?: string | null;
	closedAt?: string | null;
	reviewDecision?: "REVIEW_REQUIRED" | "APPROVED" | "CHANGES_REQUESTED" | null;
	checks?: RawContext[];
};

export const checkRun = (name: string, conclusion: string | null, workflow: string | null = null): RawContext => ({
	__typename: "CheckRun",
	name,
	status: conclusion === null ? "IN_PROGRESS" : "COMPLETED",
	conclusion,
	detailsUrl: `https://github.com/acme/web/runs/${name}`,
	checkSuite: { workflowRun: workflow === null ? null : { workflow: { name: workflow } } },
});

export const rawPullRequest = (pr: PrFixture) => ({
	number: pr.number,
	title: pr.title ?? `PR ${pr.number}`,
	state: pr.state ?? "OPEN",
	isDraft: pr.isDraft ?? false,
	url: pr.url ?? `https://github.com/acme/web/pull/${pr.number}`,
	headRefName: pr.headRefName ?? "cde-1-first",
	baseRefName: pr.baseRefName ?? "main",
	mergedAt: pr.mergedAt ?? null,
	closedAt: pr.closedAt ?? null,
	reviewDecision: pr.reviewDecision ?? null,
	commits: {
		nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: pr.checks ?? [] } } } }],
	},
});

export const graphqlResponse = (prs: PrFixture[]) => ({
	data: Object.fromEntries(prs.map((pr, index) => [`pr${index}`, { pullRequest: rawPullRequest(pr) }])),
});

export const graphqlReply = (prs: PrFixture[]) => ({
	stdout: JSON.stringify(graphqlResponse(prs)),
	stderr: "",
	exitCode: 0,
});

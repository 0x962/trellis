// The answers of the gh stub (apps/server/test/stubs/gh.ts), keyed by the
// first two arguments of a gh call. gh is signed out, so the web shows the
// banner. A link still reads the pull request, and it has one failing check.

const signedOut = {
	stdout: "",
	stderr: "You are not logged into any GitHub hosts. To log in, run: gh auth login",
	exitCode: 1,
};

const check = (name: string, conclusion: string) => ({
	__typename: "CheckRun",
	name,
	status: "COMPLETED",
	conclusion,
	detailsUrl: `https://github.com/acme/web/runs/${encodeURIComponent(name)}`,
	checkSuite: { workflowRun: null },
});

export const failingPrUrl = "https://github.com/acme/web/pull/7";

const failingPr = {
	number: 7,
	title: "Fix the desktop typecheck",
	state: "OPEN",
	isDraft: false,
	url: failingPrUrl,
	headRefName: "nyo-1-typecheck",
	baseRefName: "main",
	mergedAt: null,
	closedAt: null,
	reviewDecision: null,
	commits: {
		nodes: [
			{
				commit: {
					statusCheckRollup: {
						contexts: { nodes: [check("lint", "SUCCESS"), check("typecheck (desktop)", "FAILURE")] },
					},
				},
			},
		],
	},
};

const reviewMeta = {
	...failingPr,
	headRefOid: "head",
	baseRefOid: "base",
	headRepository: { nameWithOwner: "acme/web" },
	author: { login: "reviewer" },
	changedFiles: 1,
	additions: 1,
	deletions: 1,
	comments: [],
	reviews: [],
	labels: [],
	statusCheckRollup: [check("unit", "SUCCESS")],
};
export const ghReplies = {
	"pr view": { stdout: JSON.stringify(reviewMeta), stderr: "", exitCode: 0 },
	"pr diff": {
		stdout:
			"diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n",
		stderr: "",
		exitCode: 0,
	},
	"pr review": { stdout: "", stderr: "", exitCode: 0 },
	"api repos/acme/web/compare/base...head": {
		stdout: JSON.stringify({ merge_base_commit: { sha: "base" } }),
		stderr: "",
		exitCode: 0,
	},
	"label list": { stdout: "[]", stderr: "", exitCode: 0 },
	"auth status": signedOut,
	"api graphql": {
		stdout: JSON.stringify({
			data: { pr0: { pullRequest: failingPr }, repository: { pullRequest: { stack: null, mergeQueueEntry: null } } },
		}),
		stderr: "",
		exitCode: 0,
	},
};

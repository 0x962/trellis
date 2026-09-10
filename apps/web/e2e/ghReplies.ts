// The answers of the gh stub (apps/server/test/stubs/gh.ts), keyed by the
// first two arguments of a gh call. gh is signed out, so the web shows the
// banner. A link still reads the pull request, and its one failing check
// puts the ticket in the Failing CI section of Needs you.

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

export const ghReplies = {
	"auth status": signedOut,
	"api graphql": { stdout: JSON.stringify({ data: { pr0: { pullRequest: failingPr } } }), stderr: "", exitCode: 0 },
};

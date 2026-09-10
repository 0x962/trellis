import type { LinkedPullRequest } from "@trellis/api";

// The names of the failing checks on a ticket's open pull requests, in check
// order. A closed or merged pull request carries no work, so its checks are
// left out.
export const failingChecks = (prs: LinkedPullRequest[]): string[] =>
	prs
		.filter((pr) => pr.state === "open")
		.flatMap((pr) => pr.checks.filter((check) => check.bucket === "fail").map((check) => check.name));

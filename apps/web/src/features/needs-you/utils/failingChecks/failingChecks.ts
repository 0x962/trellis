import type { LinkedPullRequest } from "@trellis/api";

// The names of the failing checks on a ticket's open pull requests, in check
// order. A closed or merged pull request carries no work, so its checks are
// left out.
export const failingChecks = (_prs: LinkedPullRequest[]): string[] => {
	throw new Error("failingChecks is not implemented.");
};

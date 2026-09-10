import type { PullRequestRef } from "../gh/graphql.ts";

const PULL_URL = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/([1-9][0-9]*)(?:[/?#]|$)/i;

// The owner and the repository are case-insensitive on GitHub and lower-case
// in the database, so two spellings of one pull request are one row.
export const parsePullRequestUrl = (url: string): PullRequestRef | null => {
	const match = PULL_URL.exec(url);
	if (match === null) return null;
	return { owner: match[1]!.toLowerCase(), repo: match[2]!.toLowerCase(), number: Number(match[3]) };
};

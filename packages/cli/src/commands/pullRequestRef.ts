import type { PullRequest, TrellisClient } from "@trellis/api";
import { reviewRef } from "@trellis/api/client";
import { notFound, usageError } from "../errors.ts";

export type PullRequestRef = { id: string; url: string };

export const resolvePullRequest = async (
	client: TrellisClient,
	input: string,
	retain: boolean,
): Promise<PullRequestRef> => {
	const reviews = await client.reviews.prs({});
	if (/^\d+$/.test(input)) {
		const number = Number(input);
		const local = reviews.filter((row) => row.number === number);
		if (local.length > 1)
			throw usageError(`pull request ${input} matches more than one repository; use owner/repo#${input}`);
		if (local.length === 1) return { id: local[0]!.id, url: local[0]!.url };
		if (!retain) throw notFound("pull request", input);
		const remote = (await client.reviews.mine({})).filter((row) => row.number === number);
		if (remote.length === 0) throw notFound("pull request", input);
		if (remote.length > 1)
			throw usageError(`pull request ${input} matches more than one repository; use owner/repo#${input}`);
		const opened = await client.reviews.open({ pr: remote[0]!.url });
		return { id: opened.id, url: opened.url };
	}
	const url = reviewRef(input).url;
	const local = reviews.find((row) => row.url === url);
	if (local) return { id: local.id, url: local.url };
	if (!retain) throw notFound("pull request", input);
	const opened = await client.reviews.open({ pr: url });
	return { id: opened.id, url: opened.url };
};

export const currentHead = async (
	client: TrellisClient,
	ref: PullRequestRef,
): Promise<{ sha: string; pullRequest: PullRequest }> => {
	const pullRequest = await client.pullRequests.refresh({ id: ref.id });
	const status = await client.reviews.status({ pr: ref.url });
	return { sha: status.headRefOid as string, pullRequest };
};

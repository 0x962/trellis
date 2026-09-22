import { ORPCError } from "@orpc/client";
import type { PullRequest, TrellisClient } from "@trellis/api";
import { reviewRef } from "@trellis/api/client";
import { notFound, usageError } from "../errors.ts";

export type PullRequestRef = { id: string; url: string };

const refLabel = (input: string): string => {
	if (/^\d+$/.test(input)) return input;
	try {
		const ref = reviewRef(input);
		return `${ref.owner}/${ref.repo}#${ref.number}`;
	} catch {
		return input;
	}
};

export const resolvePullRequest = async (
	client: TrellisClient,
	input: string,
	retain: boolean,
): Promise<PullRequestRef> => {
	const known = await client.pullRequests.resolve({ ref: input }).catch((error) => {
		if (error instanceof ORPCError && (error.code === "NOT_FOUND" || error.code === "INPUT_VALIDATION_FAILED"))
			return null;
		throw error;
	});
	if (known !== null) return known;
	if (!retain) throw notFound("pull request", refLabel(input));
	if (/^\d+$/.test(input)) {
		const remote = (await client.reviews.mine({})).filter((row) => row.number === Number(input));
		if (remote.length === 0) throw notFound("pull request", refLabel(input));
		if (remote.length > 1)
			throw usageError(`pull request ${input} matches more than one repository; use owner/repo#${input}`);
		const opened = await client.reviews.open({ pr: remote[0]!.url });
		return { id: opened.id, url: opened.url };
	}
	const url = reviewRef(input).url;
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

import { isIP } from "node:net";
import { changedFilePaths, type PullRequest, type PullRequestSummary, prPaths } from "@trellis/api";

type BodyPullRequest = Pick<PullRequest, "additions" | "changedFiles" | "deletions" | "files" | "repo">;

const fileText = (count: number): string => (count === 1 ? "1 file" : `${count} files`);

const sizeBand = (additions: number, deletions: number): "small" | "medium" | "large" => {
	const lines = additions + deletions;
	if (lines < 200) return "small";
	if (lines <= 400) return "medium";
	return "large";
};

const githubReviewUrl = (value: string): string | null => {
	const url = URL.parse(value);
	const hostname = url?.hostname.replace(/^\[|\]$/g, "") ?? "";
	if (
		url?.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.hostname === "localhost" ||
		url.hostname.endsWith(".localhost") ||
		isIP(hostname) !== 0
	)
		return null;
	return url.href;
};

export const githubBody = (
	summary: Pick<PullRequestSummary, "headline">,
	pullRequest: BodyPullRequest,
	reviewUrl: string,
): string => {
	const { additions, deletions, changedFiles, files } = pullRequest;
	if (additions === null || deletions === null || changedFiles === null || files === null)
		throw new Error(`pull request ${pullRequest.repo} has no diff counts yet`);
	const risk = prPaths(pullRequest.repo, changedFilePaths(files)).risk;
	const exportedReviewUrl = githubReviewUrl(reviewUrl);
	const lines = [
		summary.headline,
		`size +${additions} −${deletions} · ${fileText(changedFiles)} · band ${sizeBand(additions, deletions)}`,
		`risk auth ${risk.auth} · migration ${risk.migration} · dependency ${risk.dependency} · shared type ${risk.sharedType} · deleted test ${risk.deletedTest}`,
	];
	if (exportedReviewUrl !== null) lines.push(`review ${exportedReviewUrl}`);
	return `${lines.join("\n")}\n`;
};

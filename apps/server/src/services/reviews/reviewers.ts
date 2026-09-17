import type { Tx } from "../../db/tx";
import type { PrepareCtx, ServiceCtx } from "../support";
import { parseRef } from "./queries";
import { gh } from "./revision";

type Collaborator = {
	login: string;
	avatar_url: string;
	type: string;
};

export const reviewerCandidates = (pages: Collaborator[][]) =>
	pages
		.flat()
		.filter((candidate) => candidate.type === "User")
		.map((candidate) => ({ login: candidate.login, avatarUrl: candidate.avatar_url }));

export const reviewerRequestArgs = (
	ref: { owner: string; repo: string; number: number },
	input: { reviewer: string; remove: boolean },
) => [
	"api",
	"--method",
	input.remove ? "DELETE" : "POST",
	`repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/requested_reviewers`,
	"-f",
	`reviewers[]=${input.reviewer}`,
];

export async function reviewers(ctx: PrepareCtx, input: { pr: string }) {
	const ref = parseRef(input.pr);
	const pages = JSON.parse(
		await gh(ctx, ["api", `repos/${ref.owner}/${ref.repo}/collaborators?per_page=100`, "--paginate", "--slurp"]),
	) as Collaborator[][];
	return reviewerCandidates(pages);
}

export async function reviewer(ctx: PrepareCtx, input: { pr: string; reviewer: string; remove: boolean }) {
	const ref = parseRef(input.pr);
	await gh(ctx, reviewerRequestArgs(ref, input));
	return { reviewer: input.reviewer, removed: input.remove };
}

export const result = <T>(_ctx: ServiceCtx, _tx: Tx, input: T) => Promise.resolve(input);

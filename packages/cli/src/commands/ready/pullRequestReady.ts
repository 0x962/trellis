import type { TrellisClient } from "@trellis/api/client";
import { currentHead, type PullRequestRef } from "../pullRequestRef.ts";

export type ReadinessPart = "explanation" | "evidence";

export type PullRequestReadiness = {
	pullRequest: { number: number; url: string; headSha: string };
	// The parts the pull request still needs, in the order an agent writes them.
	missing: ReadinessPart[];
	ready: boolean;
};

// The explanation must match the current head, because `trellis summary
// write` states what that head changes. The evidence document counts at any
// head.
export const pullRequestReadiness = async (
	client: TrellisClient,
	ref: PullRequestRef,
): Promise<PullRequestReadiness> => {
	const head = await currentHead(client, ref);
	const [summary, evidence] = await Promise.all([
		client.pullRequests.readSummaryHead({ id: ref.id, headSha: head.sha }),
		client.pullRequests.readEvidence({ id: ref.id }),
	]);
	const missing = [
		...(summary === null ? (["explanation"] as const) : []),
		...(evidence === null ? (["evidence"] as const) : []),
	];
	return {
		pullRequest: { number: head.pullRequest.number, url: ref.url, headSha: head.sha },
		missing,
		ready: missing.length === 0,
	};
};

// `trellis pr add` prints this line after an agent links a pull request with
// both parts. The link stores the pull request as a draft, and the person
// does not review it until the agent runs `trellis ready`.
export const pullRequestDraftText = (number: number): string =>
	`#${number} is a draft. When the work is complete and you want the person to review it, run: trellis ready ${number}\n`;

const commandOf = (part: ReadinessPart, number: number): string =>
	part === "explanation"
		? `trellis summary write ${number} --headline "..." --why - --watch "..."`
		: `trellis evidence write ${number} --body -`;

// The text of `trellis ready <pr>` and of a refused `trellis pr add`. Each
// missing part carries the one command that writes it. `trellis ready` marks
// the pull request ready for review only when nothing is missing, so the
// ready text tells the agent that the person reviews it next.
export const pullRequestReadyText = ({ pullRequest, missing }: PullRequestReadiness): string => {
	const { number } = pullRequest;
	if (missing.length === 0)
		return `#${number} is ready for review. It has the explanation and the evidence document. The person will now review it.\n`;
	return [
		`#${number} is not ready for review. Write each missing part, then run: trellis ready ${number}`,
		...missing.map((part) => `  MISSING  ${part.padEnd(11)}  ${commandOf(part, number)}`),
		"",
	].join("\n");
};

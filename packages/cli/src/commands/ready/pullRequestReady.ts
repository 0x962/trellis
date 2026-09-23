import { changedFilePaths, changesDataModels, hasMermaidErDiagram, type ReviewGap, reviewGapText } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { currentHead, type PullRequestRef } from "../pullRequestRef.ts";
import {
	type FlowReadiness,
	flowReadiness,
	flowRunMissingLines,
	flowRunMissingSummary,
	flowSkippedLines,
	flowWaivedLines,
} from "./flowReadiness.ts";

export type ReadinessPart = "explanation" | "evidence" | "data-model-diagram" | "flow-run";

export type PullRequestReadiness = {
	dataModelDiagramRequired: boolean;
	pullRequest: { number: number; url: string; headSha: string; isDraft: boolean };
	// The flows the pull request's project asks for, and the runs of the
	// current head. `flows` is empty, and `satisfied` is true, whenever the
	// caller asked for no flow check.
	flows: FlowReadiness;
	// The parts the pull request still needs, in the order an agent writes them.
	missing: ReadinessPart[];
	ready: boolean;
	// What the server says the pull request still needs, from `reviewGaps` in
	// `packages/api`, which is the list the glyph reads. The agent asking for
	// review is left out, because this command does that. `missing` above is
	// this command's own read of the parts the agent writes, and it carries
	// the command that writes each one.
	storedGaps: ReviewGap[];
};

// The explanation and the evidence document must both name the current head.
// `trellis summary write` states what that head changes, and the evidence
// document shows that head working, so a push takes both away.
//
// `checkFlows` asks for a flow run of the current head as well. `trellis
// ready` and the hand-over guard set it for an agent. `trellis pr add` leaves
// it off, because a pull request has run nothing when it is linked. Every
// caller states its answer, so a new one cannot take a silent default.
export const pullRequestReadiness = async (
	client: TrellisClient,
	ref: PullRequestRef,
	{ checkFlows }: { checkFlows: boolean },
): Promise<PullRequestReadiness> => {
	const head = await currentHead(client, ref);
	const [summary, evidence] = await Promise.all([
		client.pullRequests.readSummaryHead({ id: ref.id, headSha: head.sha }),
		client.pullRequests.readEvidence({ id: ref.id }),
	]);
	const flows = checkFlows
		? await flowReadiness(client, ref, head.ticket, head.sha)
		: { flows: [], runs: [], waived: null, skipped: null, satisfied: true };
	const dataModelDiagramRequired =
		head.pullRequest.files !== null && changesDataModels(changedFilePaths(head.pullRequest.files));
	const hasDataModelDiagram =
		dataModelDiagramRequired && (summary !== null || evidence !== null)
			? hasMermaidErDiagram([
					...(summary === null ? [] : [summary.headline, summary.why, summary.watch]),
					...(evidence === null ? [] : [evidence.body]),
				])
			: false;
	const storedGaps = head.pullRequest.reviewGaps.filter((gap) => gap.kind !== "not-asked");
	const missing = [
		...(summary === null ? (["explanation"] as const) : []),
		...(evidence === null || evidence.headSha !== head.sha ? (["evidence"] as const) : []),
		...(dataModelDiagramRequired && !hasDataModelDiagram ? (["data-model-diagram"] as const) : []),
		...(flows.satisfied ? [] : (["flow-run"] as const)),
	];
	return {
		storedGaps,
		dataModelDiagramRequired,
		pullRequest: {
			number: head.pullRequest.number,
			url: ref.url,
			headSha: head.sha,
			isDraft: head.pullRequest.isDraft,
		},
		flows,
		missing,
		ready: missing.length === 0,
	};
};

// `trellis pr add` prints this line after an agent links a pull request with
// both parts. The pull request waits in Trellis, and the person does not
// review it until the agent runs `trellis ready`.
export const pullRequestWaitingText = (number: number): string =>
	`#${number} waits in Trellis. When the work is complete and you want the person to review it, run: trellis ready ${number}\n`;

// The text the row prints after its label: the command that writes the part,
// or the sentence that says what to do next.
const nextStepOf = (result: PullRequestReadiness, part: ReadinessPart, number: number): string => {
	if (part === "explanation") return `trellis summary write ${number} --headline "..." --why - --watch "..."`;
	if (part === "evidence") return `trellis evidence write ${number} --body -`;
	if (part === "flow-run") return flowRunMissingSummary(result.flows, number);
	return "add a ```mermaid erDiagram``` block to the explanation or evidence document";
};

const labelOf = (part: ReadinessPart): string => {
	if (part === "data-model-diagram") return "data model diagram";
	if (part === "flow-run") return "flow run";
	return part;
};

// The flow part needs more than one command, so it carries its own lines
// under its row. Every other part says all it needs in its row.
const detailOf = (result: PullRequestReadiness, part: ReadinessPart, number: number): string[] =>
	part === "flow-run" ? flowRunMissingLines(result.flows, number) : [];

// The text of `trellis ready <pr>` and of a refused `trellis pr add`. Each
// missing part carries the one command that writes it. `trellis ready` marks
// the pull request ready for review only when nothing is missing, so the
// ready text tells the agent that the person reviews it next.
export const pullRequestReadyText = (result: PullRequestReadiness): string => {
	const { pullRequest, missing, storedGaps } = result;
	const { number } = pullRequest;
	if (missing.length === 0) {
		const parts =
			result.flows.runs.length === 0
				? "the explanation and the evidence document"
				: "the explanation, the evidence document, and a flow run on this head";
		const head =
			storedGaps.length === 0
				? `#${number} is ready for review. It has ${parts}. Trellis marked it ready for review.`
				: `#${number} is not ready for review yet. It has ${parts}, and Trellis recorded that you asked for review. It turns green for the person when this is true as well:`;
		return [
			head,
			...storedGaps.map((gap) => `  MISSING  ${reviewGapText(gap)}`),
			...flowWaivedLines(result.flows),
			...flowSkippedLines(result.flows),
			"",
		].join("\n");
	}
	const labelWidth = Math.max(...missing.map((part) => labelOf(part).length));
	return [
		`#${number} is not ready for review. Add each missing item, then run: trellis ready ${number}`,
		...missing.flatMap((part) => [
			`  MISSING  ${labelOf(part).padEnd(labelWidth)}  ${nextStepOf(result, part, number)}`,
			...detailOf(result, part, number),
		]),
		"",
	].join("\n");
};

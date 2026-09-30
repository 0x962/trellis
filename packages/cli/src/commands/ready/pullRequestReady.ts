import {
	changedFilePaths,
	changesDataModels,
	hasMermaidErDiagram,
	type LocalPrState,
	type ReviewGap,
	reviewGapText,
} from "@trellis/api";
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
	pullRequest: { number: number; url: string; headSha: string; isDraft: boolean; localState?: LocalPrState };
	// The flows the pull request's project asks for, and the runs the pull
	// request already holds. `flows` is empty, and `satisfied` is true,
	// whenever the caller asked for no flow check.
	flows: FlowReadiness;
	// The parts the pull request still needs, in the order an agent writes them.
	missing: ReadinessPart[];
	ready: boolean;
	// Stored diagnostics supplement the material checks in `missing`.
	// The caller handles the local request through `pullRequest.localState`.
	storedGaps: ReviewGap[];
};

// Review diagnostics compare the saved explanation, current evidence, and flow results.
export const pullRequestReadiness = async (
	client: TrellisClient,
	ref: PullRequestRef,
	{ checkFlows }: { checkFlows: boolean },
): Promise<PullRequestReadiness> => {
	const head = await currentHead(client, ref);
	const [summary, evidence] = await Promise.all([
		client.pullRequests.readSummary({ id: ref.id }),
		client.pullRequests.readEvidence({ id: ref.id }),
	]);
	const flows = checkFlows
		? await flowReadiness(client, ref, head.ticket)
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
			localState: head.pullRequest.localState,
		},
		flows,
		missing,
		ready: missing.length === 0,
	};
};

// A local review request is separate from the link between a diff and a ticket.
export const pullRequestWaitingText = (number: number): string =>
	`#${number} waits in Trellis. When the work is complete and you want the person to review it, run: trellis diff set-state ${number} ready\n`;

// The text the row prints after its label: the command that writes the part,
// or the sentence that says what to do next.
const nextStepOf = (result: PullRequestReadiness, part: ReadinessPart, number: number): string => {
	if (part === "explanation") return `trellis diff summary write ${number} --headline "..." --why - --watch "..."`;
	if (part === "evidence") return `trellis diff evidence write ${number} --body -`;
	if (part === "flow-run") return flowRunMissingSummary(result.flows);
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

// Each missing review material names the command that supplies it.
export const pullRequestReadyText = (result: PullRequestReadiness): string => {
	const { pullRequest, missing, storedGaps } = result;
	const { number } = pullRequest;
	if (missing.length === 0) {
		const head =
			storedGaps.length === 0
				? `Review material for #${number} is complete.`
				: `Review material for #${number} is complete. Other review gaps remain:`;
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
		`#${number} has incomplete review material. The local review request is independent of these checks:`,
		...missing.flatMap((part) => [
			`  MISSING  ${labelOf(part).padEnd(labelWidth)}  ${nextStepOf(result, part, number)}`,
			...detailOf(result, part, number),
		]),
		"",
	].join("\n");
};

import { changedFilePaths, changesDataModels, hasMermaidErDiagram } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { currentHead, type PullRequestRef } from "../pullRequestRef.ts";
import { type FlowReadiness, flowMissingLines, flowMissingSummary, flowReadiness } from "./flowReadiness.ts";

export type ReadinessPart = "explanation" | "evidence" | "data-model-diagram" | "flow-run";

export type PullRequestReadiness = {
	dataModelDiagramRequired: boolean;
	pullRequest: { number: number; url: string; headSha: string };
	// The flows the server holds and the runs of the current head. `flows` is
	// empty, and `satisfied` is true, whenever the caller asked for no flow
	// check.
	flows: FlowReadiness;
	// The parts the pull request still needs, in the order an agent writes them.
	missing: ReadinessPart[];
	ready: boolean;
};

// The explanation must match the current head, because `trellis summary
// write` states what that head changes. The evidence document counts at any
// head.
//
// `checkFlows` asks for a flow run of the current head as well. `trellis
// ready` sets it for an agent. `trellis pr add` and the hand-over guard
// leave it off, because a pull request has run nothing when it is linked.
export const pullRequestReadiness = async (
	client: TrellisClient,
	ref: PullRequestRef,
	checkFlows = false,
): Promise<PullRequestReadiness> => {
	const head = await currentHead(client, ref);
	const [summary, evidence] = await Promise.all([
		client.pullRequests.readSummaryHead({ id: ref.id, headSha: head.sha }),
		client.pullRequests.readEvidence({ id: ref.id }),
	]);
	const flows = checkFlows
		? await flowReadiness(client, head.ticket, head.sha)
		: { flows: [], runs: [], satisfied: true };
	const dataModelDiagramRequired =
		head.pullRequest.files !== null && changesDataModels(changedFilePaths(head.pullRequest.files));
	const hasDataModelDiagram =
		dataModelDiagramRequired && (summary !== null || evidence !== null)
			? hasMermaidErDiagram([
					...(summary === null ? [] : [summary.headline, summary.why, summary.watch]),
					...(evidence === null ? [] : [evidence.body]),
				])
			: false;
	const missing = [
		...(summary === null ? (["explanation"] as const) : []),
		...(evidence === null ? (["evidence"] as const) : []),
		...(dataModelDiagramRequired && !hasDataModelDiagram ? (["data-model-diagram"] as const) : []),
		...(flows.satisfied ? [] : (["flow-run"] as const)),
	];
	return {
		dataModelDiagramRequired,
		pullRequest: { number: head.pullRequest.number, url: ref.url, headSha: head.sha },
		flows,
		missing,
		ready: missing.length === 0,
	};
};

// `trellis pr add` prints this line after an agent links a pull request with
// both parts. The link stores the pull request as a draft, and the person
// does not review it until the agent runs `trellis ready`.
export const pullRequestDraftText = (number: number): string =>
	`#${number} is a draft. When the work is complete and you want the person to review it, run: trellis ready ${number}\n`;

const commandOf = (result: PullRequestReadiness, part: ReadinessPart, number: number): string => {
	if (part === "explanation") return `trellis summary write ${number} --headline "..." --why - --watch "..."`;
	if (part === "evidence") return `trellis evidence write ${number} --body -`;
	if (part === "flow-run") return flowMissingSummary(result.flows, number);
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
	part === "flow-run" ? flowMissingLines(result.flows, number) : [];

// The text of `trellis ready <pr>` and of a refused `trellis pr add`. Each
// missing part carries the one command that writes it. `trellis ready` marks
// the pull request ready for review only when nothing is missing, so the
// ready text tells the agent that the person reviews it next.
export const pullRequestReadyText = (result: PullRequestReadiness): string => {
	const { pullRequest, missing } = result;
	const { number } = pullRequest;
	if (missing.length === 0) {
		const parts =
			result.flows.runs.length === 0
				? "the explanation and the evidence document"
				: "the explanation, the evidence document, and a flow run on this head";
		return `#${number} is ready for review. It has ${parts}. The person will now review it.\n`;
	}
	const labelWidth = Math.max(...missing.map((part) => labelOf(part).length));
	return [
		`#${number} is not ready for review. Add each missing item, then run: trellis ready ${number}`,
		...missing.flatMap((part) => [
			`  MISSING  ${labelOf(part).padEnd(labelWidth)}  ${commandOf(result, part, number)}`,
			...detailOf(result, part, number),
		]),
		"",
	].join("\n");
};

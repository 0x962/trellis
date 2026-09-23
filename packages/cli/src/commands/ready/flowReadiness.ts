import { type FlowSummary, flowRunWorks } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { flowChoiceLines, flowRunCommand } from "../flows/flowText.ts";
import type { PullRequestRef } from "../pullRequestRef.ts";

// One run of the commit the pull request points at now.
type CurrentHeadRun = { slug: string; name: string; status: string };

export type FlowReadiness = {
	// Every flow the server holds. If this list is empty, `trellis ready` asks
	// for no flow run.
	flows: FlowSummary[];
	runs: CurrentHeadRun[];
	// What the agent wrote when it said that no flow fits this change at this
	// head. It answers the check in place of a run.
	waived: string | null;
	satisfied: boolean;
};

// A flow is machine review, and it asks the person nothing. Only a run that
// finished answers the check. A run that stopped and waits did not finish,
// so the pull request is not ready and the agent runs the flow again.
const answersTheCheck = (run: CurrentHeadRun) => run.status === "succeeded";

// A flow runs against a ticket. If no ticket links the pull request,
// `trellis ready` asks for no flow run.
export const flowReadiness = async (
	client: TrellisClient,
	ref: PullRequestRef,
	ticket: string | null,
	headSha: string,
): Promise<FlowReadiness> => {
	const flows = await client.flows.list({});
	if (flows.length === 0 || ticket === null) return { flows, runs: [], waived: null, satisfied: true };
	const [records, waiver] = await Promise.all([
		client.flowExecutions.list({ ticket, headSha }),
		client.pullRequests.readFlowWaiver({ id: ref.id }),
	]);
	const runs = records.map((record) => ({
		slug: record.doc.flow.slug,
		name: record.doc.flow.name,
		status: record.state.status,
	}));
	const waived = waiver !== null && waiver.headSha === headSha ? waiver.reason : null;
	return { flows, runs, waived, satisfied: waived !== null || runs.some(answersTheCheck) };
};

// The one sentence beside `MISSING  flow run`.
export const flowRunMissingSummary = ({ runs }: FlowReadiness, number: number): string => {
	if (runs.length === 0) return "no flow ran on the current head";
	if (runs.some((run) => flowRunWorks(run.status)))
		return `a flow still works. Wait for it, then run: trellis ready ${number}`;
	return "no flow run on the current head finished";
};

// The last line of the block: the way out for a change that no flow fits.
// An agent states the reason once, and `trellis ready` takes it for this head.
const notApplicableLines = (number: number): string[] => [
	"    A flow that does not fit this change is answered in one step. Write the reason in the",
	"    evidence document, then record it here:",
	`      trellis ready ${number} --flow-does-not-apply "<reason>"`,
];

// How one run that did not finish reads in its line.
const endWord = (status: string): string => {
	if (status === "canceled") return "was canceled";
	if (status === "waiting") return "stopped and did not finish";
	return "failed";
};

// The lines under `MISSING  flow run`. With no run they name each flow the
// agent could pick and the command that starts it. With a run that did not
// finish they name that run and both ways out of it.
export const flowRunMissingLines = (readiness: FlowReadiness, number: number): string[] => {
	const { flows, runs } = readiness;
	if (runs.length === 0)
		return [
			"    Pick the flows that fit this change and run each one:",
			...flowChoiceLines(flows, number),
			...notApplicableLines(number),
		];
	if (runs.some((run) => flowRunWorks(run.status)))
		return runs.filter((run) => flowRunWorks(run.status)).map((run) => `    The ${run.name} flow is still at work.`);
	return [
		...runs.flatMap((run) => [
			`    The ${run.name} flow ${endWord(run.status)}. Fix the fault and run it again:`,
			`      ${flowRunCommand(run.slug, number)}`,
		]),
		...notApplicableLines(number),
	];
};

// The line `trellis ready` adds when it passes on the agent's own sentence
// instead of a run. The person reads the sentence in the agent's report.
export const flowWaivedLines = ({ waived }: FlowReadiness): string[] =>
	waived === null ? [] : [`  No flow fits this change, and the agent wrote why: ${waived}`];

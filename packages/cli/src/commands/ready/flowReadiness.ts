import { type FlowSummary, flowRunNeedsPerson, flowRunWorks } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { flowChoiceLines, flowRunCommand } from "../flows/flowText.ts";
import type { PullRequestRef } from "../pullRequestRef.ts";

// One run of the commit the pull request points at now.
type CurrentHeadRun = { slug: string; name: string; status: string };

export type FlowReadiness = {
	// The flows of the pull request's project, and the flows that belong to
	// every project. If this list is empty, `trellis ready` asks for no flow
	// run.
	flows: FlowSummary[];
	runs: CurrentHeadRun[];
	// What the agent wrote when it said that no flow fits this change at this
	// head. It answers the check in place of a run.
	waived: string | null;
	// Why the check asked for no flow run. null when it asked for one.
	skipped: "no-ticket" | "no-flow" | null;
	satisfied: boolean;
};

// A run that reached its last agent step and now waits for a person answers
// the check. Every agent step of that run passed, and only a person can move
// it, so a block here would hold the agent and the person against each other:
// the agent would wait for the run, and the person opens the Flows tab of the
// pull request during the review the agent is asking for.
const answersTheCheck = (run: CurrentHeadRun) => run.status === "succeeded" || flowRunNeedsPerson(run.status);

// A flow runs against a ticket, and the ticket names the project whose flows
// the check asks for. If no ticket links the pull request, `trellis ready`
// asks for no flow run.
export const flowReadiness = async (
	client: TrellisClient,
	ref: PullRequestRef,
	ticket: string | null,
	headSha: string,
): Promise<FlowReadiness> => {
	if (ticket === null) return { flows: [], runs: [], waived: null, skipped: "no-ticket", satisfied: true };
	const flows = await client.flows.list({ ticket });
	if (flows.length === 0) return { flows, runs: [], waived: null, skipped: "no-flow", satisfied: true };
	const [records, waiver] = await Promise.all([
		client.flowExecutions.list({ ticket, headSha }),
		client.pullRequests.readFlowWaiver({ id: ref.id }),
	]);
	// A run of a flow the project no longer asks for answers nothing. A flow
	// that moved to another project leaves such runs behind.
	const asked = new Set(flows.map((flow) => flow.slug));
	const runs = records
		.filter((record) => asked.has(record.doc.flow.slug))
		.map((record) => ({
			slug: record.doc.flow.slug,
			name: record.doc.flow.name,
			status: record.state.status,
		}));
	const waived = waiver !== null && waiver.headSha === headSha ? waiver.reason : null;
	return { flows, runs, waived, skipped: null, satisfied: waived !== null || runs.some(answersTheCheck) };
};

// The one sentence beside `MISSING  flow run`.
export const flowRunMissingSummary = ({ runs }: FlowReadiness, number: number): string => {
	if (runs.length === 0) return "no flow ran on the current head";
	if (runs.some((run) => flowRunWorks(run.status)))
		return `a flow still works. Wait for it, then run: trellis ready ${number}`;
	return "every flow run on the current head ended without success";
};

// The last line of the block: the way out for a change that no flow fits.
// An agent states the reason once, and `trellis ready` takes it for this head.
const notApplicableLines = (number: number): string[] => [
	"    A flow that does not fit this change is answered in one step. Write the reason in the",
	"    evidence document, then record it here:",
	`      trellis ready ${number} --flow-does-not-apply "<reason>"`,
];

// The lines under `MISSING  flow run`. With no run they name each flow the
// agent could pick and the command that starts it. With a run that ended
// without success they name that run and both ways out of it.
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
			`    The ${run.name} flow ${run.status === "canceled" ? "was canceled" : "failed"}. Fix the fault and run it again:`,
			`      ${flowRunCommand(run.slug, number)}`,
		]),
		...notApplicableLines(number),
	];
};

// The line `trellis ready` adds when it passes on a run that waits for a
// person. The person reads it in the agent's report and knows what to answer.
export const flowRunWaitingLines = ({ runs }: FlowReadiness): string[] =>
	runs
		.filter((run) => flowRunNeedsPerson(run.status))
		.map((run) => `  The ${run.name} flow waits for you. Answer its open step in the Flows tab of the pull request.`);

// The line `trellis ready` adds when it asked for no flow run at all. Every
// other result of the check prints a line, so without this one the reader of
// an agent's report cannot tell a project that holds no flow from a pull
// request that lost its ticket.
export const flowSkippedLines = ({ skipped }: FlowReadiness): string[] => {
	if (skipped === "no-ticket") return ["  No ticket links this pull request, so Trellis asked for no flow run."];
	if (skipped === "no-flow")
		return ["  No flow applies to the project of this pull request, so Trellis asked for no flow run."];
	return [];
};

// The line `trellis ready` adds when it passes on the agent's own sentence
// instead of a run. The person reads the sentence in the agent's report.
export const flowWaivedLines = ({ waived }: FlowReadiness): string[] =>
	waived === null ? [] : [`  No flow fits this change, and the agent wrote why: ${waived}`];

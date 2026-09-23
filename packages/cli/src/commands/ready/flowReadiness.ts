import { type FlowSummary, flowRunNeedsPerson, flowRunWorks } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { flowChoiceLines, flowRunCommand } from "../flows/flowText.ts";

// One run of the commit the pull request points at now.
type CurrentHeadRun = { slug: string; name: string; status: string };

export type FlowReadiness = {
	// Every flow the server holds. If this list is empty, `trellis ready` asks
	// for no flow run.
	flows: FlowSummary[];
	runs: CurrentHeadRun[];
	satisfied: boolean;
};

// A run that reached its last agent step and now waits for a person answers
// the check. Every agent step of that run passed, and only a person can move
// it, so a block here would hold the agent and the person against each other:
// the agent would wait for the run, and the person opens the Flows tab of the
// pull request during the review the agent is asking for.
const answersTheCheck = (run: CurrentHeadRun) => run.status === "succeeded" || flowRunNeedsPerson(run.status);

// A flow runs against a ticket. If no ticket links the pull request,
// `trellis ready` asks for no flow run.
export const flowReadiness = async (
	client: TrellisClient,
	ticket: string | null,
	headSha: string,
): Promise<FlowReadiness> => {
	const flows = await client.flows.list({});
	if (flows.length === 0 || ticket === null) return { flows, runs: [], satisfied: true };
	const records = await client.flowExecutions.list({ ticket, headSha });
	const runs = records.map((record) => ({
		slug: record.doc.flow.slug,
		name: record.doc.flow.name,
		status: record.state.status,
	}));
	return { flows, runs, satisfied: runs.some(answersTheCheck) };
};

// The one sentence beside `MISSING  flow run`.
export const flowRunMissingSummary = ({ runs }: FlowReadiness, number: number): string => {
	if (runs.length === 0) return "no flow ran on the current head";
	if (runs.some((run) => flowRunWorks(run.status)))
		return `a flow still works. Wait for it, then run: trellis ready ${number}`;
	return "every flow run on the current head ended without success";
};

// The lines under `MISSING  flow run`. With no run they name each flow the
// agent could pick and the command that starts it. With a run that ended
// without success they name that run and both ways out of it.
export const flowRunMissingLines = (readiness: FlowReadiness, number: number): string[] => {
	const { flows, runs } = readiness;
	if (runs.length === 0)
		return ["    Pick the flows that fit this change and run each one:", ...flowChoiceLines(flows, number)];
	if (runs.some((run) => flowRunWorks(run.status)))
		return runs.filter((run) => flowRunWorks(run.status)).map((run) => `    The ${run.name} flow is still at work.`);
	return runs.flatMap((run) => [
		`    The ${run.name} flow ${run.status === "canceled" ? "was canceled" : "failed"}. Fix the fault and run it again:`,
		`      ${flowRunCommand(run.slug, number)}`,
		"    Or write in the evidence document why this flow does not apply to the change.",
	]);
};

// The line `trellis ready` adds when it passes on a run that waits for a
// person. The person reads it in the agent's report and knows what to answer.
export const flowRunWaitingLines = ({ runs }: FlowReadiness): string[] =>
	runs
		.filter((run) => flowRunNeedsPerson(run.status))
		.map((run) => `  The ${run.name} flow waits for you. Answer its open step in the Flows tab of the pull request.`);

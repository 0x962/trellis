import type { FlowSummary } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { flowChoiceLines, flowRunCommand } from "../flows/flowText.ts";

// One flow run that names the commit the pull request points at now.
type HeadRun = { slug: string; name: string; status: string };

export type FlowReadiness = {
	// Every flow the server holds. A server with no flow asks for no run, so
	// this list is the whole condition for the check.
	flows: FlowSummary[];
	runs: HeadRun[];
	satisfied: boolean;
};

const live = (run: HeadRun) => run.status === "running" || run.status === "waiting";

// A pull request that no ticket links can start no flow, because a flow runs
// against a ticket. `trellis ready` asks such a pull request for no run.
export const flowReadiness = async (
	client: TrellisClient,
	ticket: string | null,
	headSha: string,
): Promise<FlowReadiness> => {
	const flows = await client.flows.list({});
	if (flows.length === 0 || ticket === null) return { flows, runs: [], satisfied: true };
	const records = await client.flowExecutions.list({ ticket });
	const runs = records
		.filter((record) => record.headSha === headSha)
		.map((record) => ({ slug: record.doc.flow.slug, name: record.doc.flow.name, status: record.state.status }));
	return { flows, runs, satisfied: runs.some((run) => run.status === "succeeded") };
};

// The one sentence beside `MISSING  flow run`.
export const flowMissingSummary = ({ runs }: FlowReadiness, number: number): string => {
	if (runs.length === 0) return "no flow ran on the current head";
	if (runs.some(live)) return `a flow still runs; wait for it, then run: trellis ready ${number}`;
	return "every flow run on the current head ended without success";
};

// The lines under `MISSING  flow run`. With no run they name each flow the
// agent could pick and the command that starts it. With a run that ended
// without success they name that run and both ways out of it.
export const flowMissingLines = (readiness: FlowReadiness, number: number): string[] => {
	const { flows, runs } = readiness;
	if (runs.length === 0)
		return ["    Pick the flows that fit this change and run each one:", ...flowChoiceLines(flows, number)];
	if (runs.some(live)) return runs.filter(live).map((run) => `    The ${run.name} flow is ${run.status}.`);
	return runs.flatMap((run) => [
		`    The ${run.name} flow ${run.status === "canceled" ? "was canceled" : "failed"}. Fix the fault and run it again:`,
		`      ${flowRunCommand(run.slug, number)}`,
		"    Or write in the evidence document why this flow does not apply to the change.",
	]);
};

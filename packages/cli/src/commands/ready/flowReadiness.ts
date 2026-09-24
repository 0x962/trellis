import { type FlowSummary, flowRunWorks } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { listRuns } from "../flow/listRuns.ts";
import { flowChoiceLines, flowRunCommand } from "../flows/flowText.ts";
import type { PullRequestRef } from "../pullRequestRef.ts";

// A completed flow review applies to its diff across later commits.
type Run = { slug: string; name: string; status: string; failureKind?: "error" | "feedback" };

export type FlowReadiness = {
	flows: FlowSummary[];
	runs: Run[];
	// What the agent wrote when it said that no flow fits this change. It
	// answers the check in place of a run.
	waived: string | null;
	// Why the check asked for no flow run. null when it asked for one.
	skipped: "no-ticket" | "no-flow" | null;
	satisfied: boolean;
};

// `reviewGaps` in `packages/api` states this rule for every surface.
const answersTheCheck = (run: Run) => run.status === "succeeded";

// The linked ticket supplies the project whose flows apply to the diff.
export const flowReadiness = async (
	client: TrellisClient,
	ref: PullRequestRef,
	ticket: string | null,
): Promise<FlowReadiness> => {
	if (ticket === null) return { flows: [], runs: [], waived: null, skipped: "no-ticket", satisfied: true };
	const flows = await client.flows.list({ ticket });
	if (flows.length === 0) return { flows, runs: [], waived: null, skipped: "no-flow", satisfied: true };
	const [records, waiver] = await Promise.all([
		listRuns(client, { diffId: ref.id }),
		client.pullRequests.readFlowWaiver({ id: ref.id }),
	]);
	const asked = new Set(flows.map((flow) => flow.id));
	const runs = records
		.filter((record) => asked.has(record.flowId))
		.map((record) => {
			const flow = flows.find((flow) => flow.id === record.flowId)!;
			return { slug: flow.slug, name: flow.name, status: record.state.status, failureKind: record.state.failureKind };
		});
	const waived = waiver === null ? null : waiver.reason;
	return { flows, runs, waived, skipped: null, satisfied: waived !== null || runs.some(answersTheCheck) };
};

// The one sentence beside `MISSING  flow run`.
export const flowRunMissingSummary = ({ runs }: FlowReadiness, number: number): string => {
	if (runs.length === 0) return "no flow ran for this pull request";
	if (runs.some((run) => flowRunWorks(run.status)))
		return `a flow still works. Wait for it, then run: trellis diff set-state ${number} ready`;
	return "no flow run finished";
};

// The last line of the block: the way out for a change that no flow fits.
// An agent records the reason once for the diff.
const notApplicableLines = (number: number): string[] => [
	"    A flow that does not fit this change is answered in one step. Write the reason in the",
	"    evidence document, then record it here:",
	`      trellis diff set-state ${number} ready --flow-does-not-apply "<reason>"`,
];

export const flowRunMissingLines = (readiness: FlowReadiness, number: number): string[] => {
	const { flows, runs } = readiness;
	if (runs.length === 0)
		return [
			"    Pick the flows that fit this change and run each one:",
			...flowChoiceLines(flows, number),
			...notApplicableLines(number),
		];
	const latest = new Map<string, Run>();
	for (const run of runs) if (!latest.has(run.slug)) latest.set(run.slug, run);
	return [...latest.values()].flatMap((run) => {
		if (run.status === "running") return [`    The ${run.name} flow is still at work.`];
		if (run.status === "waiting")
			return [`    The ${run.name} flow waits for a person. Ask the user to answer its pending step.`];
		if (run.status === "failed" && run.failureKind === "error")
			return [
				`    The ${run.name} flow ended with an execution error. Fix the cause and start it again:`,
				`      ${flowRunCommand(run.slug, number)}`,
			];
		return [
			`    Read the ${run.name} flow's result and address its feedback. Another run requires an explicit user instruction.`,
		];
	});
};

// A diff can lack applicable flows because of its project or its missing ticket link.
export const flowSkippedLines = ({ skipped }: FlowReadiness): string[] => {
	if (skipped === "no-ticket") return ["  No ticket links this pull request, so Trellis asked for no flow run."];
	if (skipped === "no-flow")
		return ["  No flow applies to the project of this pull request, so Trellis asked for no flow run."];
	return [];
};

// The person can read the agent's reason beside the diff.
export const flowWaivedLines = ({ waived }: FlowReadiness): string[] =>
	waived === null ? [] : [`  No flow fits this change, and the agent wrote why: ${waived}`];

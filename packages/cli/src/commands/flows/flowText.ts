import { type FlowExecutionRecord, type FlowSummary, flowPurpose } from "@trellis/api";

export const flowRunCommand = (slug: string, number: number): string => `trellis flow start ${slug} --diff ${number}`;

// One indented line per flow: the slug, what the flow is for, and the
// command that starts it on this pull request. An agent picks by the second
// column, so a flow with no description prints its name there instead.
export const flowChoiceLines = (flows: FlowSummary[], number: number): string[] => {
	const slugWidth = Math.max(...flows.map((flow) => flow.slug.length));
	const purposeWidth = Math.max(...flows.map((flow) => flowPurpose(flow).length));
	return flows.map(
		(flow) =>
			`    ${flow.slug.padEnd(slugWidth)}  ${flowPurpose(flow).padEnd(purposeWidth)}  ${flowRunCommand(flow.slug, number)}`,
	);
};

// The first step of the run that failed, so the reader learns where the flow
// stopped instead of only that it stopped.
const failedStep = (run: FlowExecutionRecord) => run.state.steps.find((step) => step.state === "failed");

const humanStep = (run: FlowExecutionRecord) => run.state.steps.find((step) => step.state === "waiting_human");

// Every step of a run names a node of the run's own copy of the flow, so the
// lookup always finds one.
const titleOf = (run: FlowExecutionRecord, nodeId: string) => run.doc.nodes.find((node) => node.id === nodeId)!.title;

// What `trellis flow start` prints when it stops watching a run. The flow
// name comes from the run's own copy of the flow, so a renamed flow still
// prints the name the run used.
//
// One successful run answers for the pull request, whatever commit it ran
// against. An agent reads this text and nothing else, so the success line
// says that, and it says not to run the flow again after the findings are
// fixed. A failed run is the one case that asks for another run, because a
// flow that stopped before it reported has answered nothing.
export const flowRunText = (run: FlowExecutionRecord, number: number): string => {
	const flow = run.doc.flow.name;
	if (run.state.status === "succeeded")
		return (
			`The ${flow} flow succeeded on #${number}. This one run answers for the whole diff.\n` +
			"Fix every finding it left. Do not run the flow again after you fix them.\n"
		);
	if (run.state.status === "canceled") return `The ${flow} flow was canceled on #${number}.\n`;
	if (run.state.status === "failed") {
		const step = failedStep(run);
		const where = step === undefined ? "" : ` at the step ${titleOf(run, step.nodeId)}`;
		const why = step?.error ?? run.state.error;
		return `The ${flow} flow failed on #${number}${where}.${why === null || why === undefined ? "" : ` ${why}`}\n`;
	}
	if (run.state.status === "waiting") {
		const step = humanStep(run);
		const where = step === undefined ? "" : ` at the step ${titleOf(run, step.nodeId)}`;
		return `The ${flow} flow waits for a person on #${number}${where}. Open the Flows tab of the diff to answer it.\n`;
	}
	return `The ${flow} flow still runs on #${number}. Read its state with: trellis flow run list --diff ${number}\n`;
};

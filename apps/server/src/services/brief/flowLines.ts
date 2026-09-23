import { type FlowSummary, flowPurpose } from "@trellis/api";

// The brief step that tells the agent to run the flows that fit its change.
// If the server holds no flow, this section is empty and `trellis ready` asks
// for no flow run.
export const flowLines = (flows: FlowSummary[]): string[] => {
	if (flows.length === 0) return [];
	return [
		"## Flows",
		"",
		"A flow is a saved set of agent steps that Trellis runs against your pull request. These flows exist:",
		"",
		...flows.map((flow) => `- ${flow.slug}: ${flowPurpose(flow)}`),
		"",
		"Read the list again with trellis flows list.",
		"Pick every flow that fits your change. Start each one and wait for its result: trellis flows run <pr> --flow <slug>",
		"trellis ready <pr> and trellis move <ticket> human-review accept the pull request once a flow run of the current head succeeds, or stops at a step that only a person answers. Until then they name the flows you can run.",
		"When a flow run fails, fix the fault and run the flow again.",
		'When no flow fits your change, say so in one step. Write the reason in the evidence document, then record it: trellis ready <pr> --flow-does-not-apply "<reason>"',
		"Trellis keeps that reason with the pull request for the current head, and the person reads it beside your change.",
	];
};

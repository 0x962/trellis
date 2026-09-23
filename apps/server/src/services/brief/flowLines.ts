import { type FlowSummary, flowPurpose } from "@trellis/api";

// The brief step that tells the agent to run the flows that fit its change.
// The list holds the flows of the ticket's project and the flows that belong
// to every project. If that list is empty, this section is empty and
// `trellis ready` asks for no flow run.
export const flowLines = (flows: FlowSummary[]): string[] => {
	if (flows.length === 0) return [];
	return [
		"## Flows",
		"",
		"A flow is a saved set of agent steps that Trellis runs against your pull request. These flows apply to this project:",
		"",
		...flows.map((flow) => `- ${flow.slug}: ${flowPurpose(flow)}`),
		"",
		"Read the list again with trellis flows list --ticket <ticket>.",
		"Run the flows when you believe the work is complete, before you ask for review.",
		"Pick every flow that fits your change. Start each one and wait for its result: trellis flows run <pr> --flow <slug>",
		"trellis ready <pr> and trellis move <ticket> human-review accept the pull request once a flow run succeeds, or stops at a step that only a person answers. Until then they name the flows you can run.",
		"When a flow run fails, fix the fault and run the flow again.",
		"A flow run counts for the pull request. A later push keeps it.",
		"A finding that a flow left stays open until you answer it, and an open finding holds the pull request back.",
		'When no flow fits your change, say so in one step. Write the reason in the evidence document, then record it: trellis ready <pr> --flow-does-not-apply "<reason>"',
		"Trellis keeps that reason with the pull request, and the person reads it beside your change.",
	];
};

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
		"trellis ready <pr> exits with code 1 until a flow run of the current head succeeds, or stops at a step that only a person answers. It names the flows you can run.",
		"When a flow run fails, fix the fault and run the flow again, or write in the evidence document why the flow does not apply.",
	];
};

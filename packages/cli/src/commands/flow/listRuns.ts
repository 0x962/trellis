import type { FlowExecutionListInput, FlowExecutionRecord } from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";

export const listRuns = async (client: TrellisClient, input: Omit<FlowExecutionListInput, "limit" | "offset">) => {
	const found: FlowExecutionRecord[] = [];
	for (let offset = 0; ; offset += 500) {
		const page = await client.flowExecutions.list({ ...input, limit: 500, offset });
		found.push(...page);
		if (page.length < 500) return found;
	}
};

import type { FlowExecutionRecord, TrellisClient } from "@trellis/api";

export async function loadRunHistory(
	client: TrellisClient,
	diffId: string,
	signal: AbortSignal,
): Promise<FlowExecutionRecord[]> {
	const records = new Map<string, FlowExecutionRecord>();
	const limit = 100;
	for (let offset = 0; ; offset += limit) {
		const page = await client.flowExecutions.list({ diffId, limit, offset }, { signal });
		for (const record of page) if (!records.has(record.id)) records.set(record.id, record);
		if (page.length < limit) return [...records.values()];
	}
}

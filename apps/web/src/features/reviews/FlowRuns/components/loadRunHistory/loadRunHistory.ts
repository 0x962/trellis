import type { FlowExecutionIdentityV1, TrellisClient } from "@trellis/api";

export async function loadRunHistory(
	client: TrellisClient,
	diffId: string,
	signal: AbortSignal,
): Promise<FlowExecutionIdentityV1[]> {
	const records = new Map<string, FlowExecutionIdentityV1>();
	const limit = 100;
	for (let offset = 0; ; offset += limit) {
		const page = await client.flowDocumentsV1.list({ diffId, limit, offset }, { signal });
		for (const record of page) if (!records.has(record.id)) records.set(record.id, record);
		if (page.length < limit) return [...records.values()];
	}
}

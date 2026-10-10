import type { AgentSubagentObservation } from "@trellis/api";

export type WhiteboardSubagent = Extract<AgentSubagentObservation, { kind: "spawn" }> & { id: string };

export function mergeSubagentObservations(
	previous: readonly WhiteboardSubagent[],
	observations: readonly AgentSubagentObservation[],
) {
	const records = new Map(previous.map((record) => [record.id, record]));
	for (const observation of observations) {
		if (observation.kind === "spawn") {
			const id = `subagent:${observation.parentRunId}:${observation.attemptId}:${observation.toolCallId}`;
			const existing = records.get(id);
			const newer = existing && existing.observedAt > observation.observedAt ? existing : observation;
			records.set(id, {
				...observation,
				id,
				state: newer.state,
				output: newer.output ?? existing?.output ?? null,
				observedAt: newer.observedAt,
				prompt: observation.prompt ?? existing?.prompt ?? null,
				providerChildIds: [...new Set([...(existing?.providerChildIds ?? []), ...observation.providerChildIds])],
			});
		} else {
			for (const [id, record] of records) {
				if (
					record.parentRunId === observation.parentRunId &&
					record.providerChildIds.includes(observation.providerChildId) &&
					record.observedAt <= observation.observedAt
				)
					records.set(id, {
						...record,
						state: observation.state,
						output: observation.output ?? record.output,
						observedAt: observation.observedAt,
					});
			}
		}
	}
	return [...records.values()];
}

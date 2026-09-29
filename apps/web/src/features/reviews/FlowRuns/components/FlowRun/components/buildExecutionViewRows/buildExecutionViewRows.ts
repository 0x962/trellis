import type { FlowAttemptV1, FlowExecutionViewV1, FlowOccurrenceV1, FlowStopObligationV1 } from "@trellis/api";
import type { FlowRunState } from "@trellis/ui";
import type { FlowRunRowData } from "../../buildFlowRunRows";

export type ExecutionViewRow = FlowRunRowData & {
	occurrence: FlowOccurrenceV1 | null;
	attempt: FlowAttemptV1 | null;
	stop: FlowStopObligationV1 | null;
};

const millis = (value: string | null) => (value === null ? null : Date.parse(value));
const occurrenceKey = (key: string) => JSON.stringify(["occurrence", key]);
const attemptStates: Record<FlowAttemptV1["state"], FlowRunState> = {
	reserved: "pending",
	launched: "running",
	exited: "exited",
	unknown: "unknown",
};
const waits = {
	human: "Needs your decision",
	native: "Wait for native result",
	ownership_unknown: "Worker ownership unknown",
	admission: "Queued for admission",
};

export function buildExecutionViewRows(execution: FlowExecutionViewV1, canDecide = false): ExecutionViewRow[] {
	const rows: ExecutionViewRow[] = [];
	const byKey = new Map(execution.occurrences.map((item) => [item.occurrenceKey, item]));
	const children = new Map<string | null, FlowOccurrenceV1[]>();
	const deadlines = new Map(execution.deadlines.map((item) => [item.deadlineId, item]));
	const deliveries = new Map(execution.decisionDeliveries.map((item) => [item.occurrenceKey, item]));
	for (const item of execution.occurrences) {
		const parent =
			item.parentOccurrenceKey !== null && byKey.has(item.parentOccurrenceKey) ? item.parentOccurrenceKey : null;
		const siblings = children.get(parent) ?? [];
		siblings.push(item);
		children.set(parent, siblings);
	}
	const pendingOccurrences = (children.get(null) ?? []).toReversed().map((item) => ({ item, depth: 0 }));
	while (pendingOccurrences.length > 0) {
		const { item, depth } = pendingOccurrences.pop()!;
		const key = occurrenceKey(item.occurrenceKey);
		const childOccurrences = children.get(item.occurrenceKey) ?? [];
		const delivery = deliveries.get(item.occurrenceKey);
		const detail = [
			item.kind === null ? "Component kind unknown" : null,
			item.iterationPath.map((part) => `${part.loopNodeId}: round ${part.round}`).join(" / "),
			item.waitReason === null ? null : waits[item.waitReason],
			item.skipReason,
			item.decision === null ? null : item.decision === "yes" ? "Yes" : "No",
			delivery === undefined ? null : `Decision delivery: ${delivery.state}`,
			item.output === null
				? null
				: item.outputSource === null
					? "Output source unknown"
					: `Output from attempt ${item.outputSource.attemptId} · Result ${item.outputSource.resultId}`,
		]
			.filter(Boolean)
			.join(" · ");
		const deadlineAt = item.deadlineRefs.reduce<number | null>((earliest, ref) => {
			const deadline = millis(deadlines.get(ref)!.deadlineAt);
			return deadline === null ? earliest : earliest === null ? deadline : Math.min(earliest, deadline);
		}, null);
		const row: ExecutionViewRow = {
			key,
			parentKey:
				item.parentOccurrenceKey !== null && byKey.has(item.parentOccurrenceKey)
					? occurrenceKey(item.parentOccurrenceKey)
					: null,
			depth,
			kind: item.kind,
			title: item.title,
			state: item.state,
			meta: detail || null,
			startedAt: millis(item.startedAt),
			endedAt: millis(item.endedAt),
			deadlineAt,
			output: item.output,
			error: item.error,
			terminal: false,
			decidable: canDecide && item.state === "waiting_human" && item.waitReason === "human" && delivery === undefined,
			hasChildren: childOccurrences.length > 0 || item.attempts.length > 0,
			actionKey: item.actionKey,
			occurrence: item,
			attempt: null,
			stop: null,
		};
		rows.push(row);
		for (const attempt of item.attempts) {
			rows.push({
				...row,
				key: JSON.stringify(["attempt", item.occurrenceKey, attempt.stepId, attempt.agentRunId, attempt.attemptId]),
				parentKey: key,
				depth: depth + 1,
				kind: "agent",
				title: `Attempt ${attempt.attemptId}`,
				state: attemptStates[attempt.state],
				meta: `${attempt.state} · Result ${attempt.resultId ?? "unknown"} · Workspace commit ${attempt.workspaceCommit ?? "unknown"}`,
				startedAt: millis(attempt.launchedAt),
				endedAt: null,
				deadlineAt: null,
				output: null,
				error: null,
				terminal: true,
				decidable: false,
				hasChildren: false,
				attempt,
			});
		}
		for (let index = childOccurrences.length - 1; index >= 0; index--)
			pendingOccurrences.push({ item: childOccurrences[index]!, depth: depth + 1 });
	}
	for (const stop of execution.stopObligations) {
		if (stop.state === "confirmed") continue;
		rows.push({
			key: JSON.stringify(["stop", stop.stepId, stop.agentRunId, stop.attemptId]),
			parentKey: null,
			depth: 0,
			kind: "agent",
			title: `Stop pending: ${stop.attemptId}`,
			state: "unknown",
			meta: stop.state === "ownership_unknown" ? "Worker ownership unknown" : "Wait for stop confirmation",
			startedAt: null,
			endedAt: null,
			deadlineAt: null,
			output: stop.reason,
			error: null,
			terminal: false,
			decidable: false,
			hasChildren: false,
			actionKey: null,
			occurrence: null,
			attempt: null,
			stop,
		});
	}
	return rows;
}

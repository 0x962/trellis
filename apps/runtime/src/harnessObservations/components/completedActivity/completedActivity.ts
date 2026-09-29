import { createHash } from "node:crypto";
import type {
	HarnessEvent,
	RuntimeHarnessActivityContext,
	RuntimeHarnessActivityItem,
	RuntimeHarnessActivitySignal,
	RuntimeHarnessObservation,
} from "@trellis/runtime-protocol";

type PendingActivityTool = {
	id: string;
	name: string;
	input?: unknown;
	updates: unknown[];
};

type IncompleteMessage = { id: string; text: string };

export type CompletedActivityState = {
	activityTools?: PendingActivityTool[];
	completedActivities?: string[];
	completedSignals?: string[];
	activityTurnSequence?: number;
	activityTurn?: { id: string; open: boolean } | null;
	incompleteMessages?: Array<[string, IncompleteMessage[]]>;
};

export class CompletedActivity {
	private readonly activityTools = new Map<string, PendingActivityTool>();
	private readonly completedActivities = new Set<string>();
	private readonly completedSignals = new Set<string>();
	private activityTurnSequence = 0;
	private activityTurn: { id: string; open: boolean } | null = null;
	private readonly incompleteMessages = new Map<string, Map<string, string>>();
	constructor(saved: CompletedActivityState = {}) {
		for (const tool of saved.activityTools ?? []) this.activityTools.set(tool.id, tool);
		for (const id of saved.completedActivities ?? []) this.completedActivities.add(id);
		for (const id of saved.completedSignals ?? []) this.completedSignals.add(id);
		this.activityTurnSequence = saved.activityTurnSequence ?? 0;
		this.activityTurn = saved.activityTurn ?? null;
		for (const [turnId, messages] of saved.incompleteMessages ?? [])
			this.incompleteMessages.set(turnId, new Map(messages.map((message) => [message.id, message.text])));
	}
	snapshot(): CompletedActivityState {
		return {
			activityTools: [...this.activityTools.values()],
			completedActivities: [...this.completedActivities],
			completedSignals: [...this.completedSignals],
			activityTurnSequence: this.activityTurnSequence,
			activityTurn: this.activityTurn,
			incompleteMessages: [...this.incompleteMessages].map(([turnId, messages]) => [
				turnId,
				[...messages].map(([id, text]) => ({ id, text })),
			]),
		};
	}
	restore(observation: RuntimeHarnessObservation) {
		const derived = this.derive(observation.event, observation.observedAt, false);
		const activity = observation.activityVersion === 1 ? observation.activity : derived.activity;
		const signal = observation.activityVersion === 1 ? observation.signal : derived.signal;
		if (activity !== undefined) this.completedActivities.add(activity.id);
		if (signal !== undefined) this.completedSignals.add(signal.id);
	}
	derive(event: HarnessEvent, observedAt: string, dedupe = true) {
		const activityEvent = this.withActivityTurn(event);
		const activity = this.activityItem(activityEvent, observedAt);
		const signal = this.activitySignal(activityEvent, observedAt);
		if (
			(event.kind === "idle" || (event.kind === "error" && !event.willRetry)) &&
			this.activityTurn !== null &&
			this.activityTurn.id === activityEvent.turnId
		)
			this.activityTurn.open = false;
		return {
			...(event.kind === "message" && event.message !== undefined && !event.message.complete
				? {
						context: {
							id: this.activityId("assistant", activityEvent, event.message.text),
							kind: "message",
							role: "assistant",
							text: event.message.text,
							at: event.message.at ?? observedAt,
							turnId: activityEvent.turnId,
							completeness: "unproven",
						} satisfies RuntimeHarnessActivityContext,
					}
				: {}),
			...(activity !== undefined && (!dedupe || !this.completedActivities.has(activity.id))
				? { activity: this.rememberActivity(activity) }
				: {}),
			...(signal !== undefined && (!dedupe || !this.completedSignals.has(signal.id))
				? { signal: this.rememberSignal(signal) }
				: {}),
		};
	}
	private withActivityTurn(event: HarnessEvent): HarnessEvent {
		if (event.turnId !== undefined) {
			if (this.activityTurn === null || event.kind === "prompt" || event.kind === "working")
				this.activityTurn = { id: event.turnId, open: true };
			return event;
		}
		if (this.activityTurn === null || event.kind === "prompt" || (event.kind === "working" && !this.activityTurn.open))
			this.activityTurn = { id: `runtime-turn-${++this.activityTurnSequence}`, open: true };
		return { ...event, turnId: this.activityTurn.id };
	}
	private rememberActivity(activity: RuntimeHarnessActivityItem) {
		this.completedActivities.add(activity.id);
		return activity;
	}
	private rememberSignal(signal: RuntimeHarnessActivitySignal) {
		this.completedSignals.add(signal.id);
		return signal;
	}
	private activityId(kind: string, event: HarnessEvent, text?: string) {
		const explicit = event.activityId ?? event.message?.id;
		if (explicit !== undefined) return `${kind}:${explicit}`;
		const digest = text === undefined ? "" : createHash("sha256").update(text).digest("hex");
		return `${kind}:${event.turnId ?? "turn-unknown"}:${digest}`;
	}
	private activityItem(event: HarnessEvent, observedAt: string): RuntimeHarnessActivityItem | undefined {
		if (event.kind === "tool-start") {
			const tool = event.tool!;
			const pending = this.activityTools.get(tool.id) ?? { id: tool.id, name: tool.name, updates: [] };
			pending.name = tool.name;
			if (tool.input !== undefined) pending.input = tool.input;
			this.activityTools.set(tool.id, pending);
			return;
		}
		if (event.kind === "tool-update") {
			const tool = event.tool!;
			const pending = this.activityTools.get(tool.id) ?? { id: tool.id, name: tool.name, updates: [] };
			pending.name = tool.name;
			if (tool.input !== undefined) pending.input = tool.input;
			if (tool.output !== undefined) pending.updates.push(tool.output);
			this.activityTools.set(tool.id, pending);
			return;
		}
		if (event.kind === "tool-end") {
			const tool = event.tool!;
			const pending = this.activityTools.get(tool.id);
			this.activityTools.delete(tool.id);
			return {
				id: `tool:${tool.id}`,
				kind: "tool",
				tool: {
					id: tool.id,
					name: tool.name,
					...(tool.input !== undefined
						? { input: tool.input }
						: pending?.input !== undefined
							? { input: pending.input }
							: {}),
					...(tool.output !== undefined ? { output: tool.output } : {}),
					...(pending?.updates.length ? { updates: pending.updates } : {}),
				},
				...(event.error !== undefined ? { error: event.error } : {}),
				at: observedAt,
				...(event.turnId !== undefined ? { turnId: event.turnId } : {}),
			};
		}
		if (event.kind === "prompt")
			return {
				id: this.activityId("user", event, event.prompt),
				kind: "message",
				role: "user",
				text: event.prompt!,
				at: observedAt,
				...(event.turnId !== undefined ? { turnId: event.turnId } : {}),
			};
		if (event.kind === "message" && event.message !== undefined) {
			const id = this.activityId("assistant", event, event.message.text);
			const incomplete = this.incompleteMessages.get(event.turnId!) ?? new Map<string, string>();
			if (event.message.complete) incomplete.delete(id);
			else incomplete.set(id, event.message.text);
			if (incomplete.size === 0) this.incompleteMessages.delete(event.turnId!);
			else this.incompleteMessages.set(event.turnId!, incomplete);
			if (!event.message.complete) return;
			return {
				id,
				kind: "message",
				role: "assistant",
				text: event.message.text,
				at: event.message.at ?? observedAt,
				...(event.turnId !== undefined ? { turnId: event.turnId } : {}),
			};
		}
		if (event.kind === "idle" && event.result) {
			const incomplete = this.incompleteMessages.get(event.turnId!);
			if (event.resultActivityIds === undefined) incomplete?.delete(this.activityId("assistant", event, event.result));
			if (incomplete?.size === 0) this.incompleteMessages.delete(event.turnId!);
			if (event.resultActivityIds !== undefined) return;
			return {
				id: this.activityId("assistant", event, event.result),
				kind: "message",
				role: "assistant",
				text: event.result,
				at: observedAt,
				...(event.turnId !== undefined ? { turnId: event.turnId } : {}),
			};
		}
	}
	private activitySignal(event: HarnessEvent, observedAt: string): RuntimeHarnessActivitySignal | undefined {
		if (event.kind === "input-request")
			return {
				id: `input:${event.turnId ?? "turn-unknown"}:${event.inputRequest!.id}`,
				kind: "input-request",
				request: event.inputRequest!,
				at: observedAt,
				...(event.turnId !== undefined ? { turnId: event.turnId } : {}),
			};
		const outcome =
			event.kind === "idle" && event.outcome !== undefined
				? event.outcome
				: event.kind === "error" && !event.willRetry
					? "failed"
					: undefined;
		if (outcome === undefined) return;
		const messageAvailability =
			event.messageAvailability ?? (this.incompleteMessages.get(event.turnId!)?.size ? "unavailable" : "complete");
		this.incompleteMessages.delete(event.turnId!);
		return {
			id: `completion:${event.turnId ?? "turn-unknown"}:${outcome}`,
			kind: "completion",
			outcome,
			messageAvailability,
			at: observedAt,
			...(event.turnId !== undefined ? { turnId: event.turnId } : {}),
		};
	}
}

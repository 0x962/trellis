import { createHash } from "node:crypto";
import type {
	HarnessEvent,
	HarnessTool,
	RuntimeHarnessActivityContext,
	RuntimeHarnessActivityItem,
	RuntimeHarnessActivitySignal,
} from "@trellis/runtime-protocol";

type PendingTool = HarnessTool & { updates: unknown[] };

export class LegacyActivity {
	private readonly tools = new Map<string, PendingTool>();
	private readonly activities = new Set<string>();
	private readonly signals = new Set<string>();
	private readonly inputCycles = new Map<string, { cycle: number; open: boolean }>();
	private readonly incompleteMessages = new Map<string, Map<string, string>>();
	private turnSequence = 0;
	private turn: { id: string; open: boolean } | null = null;

	read(event: HarnessEvent, observedAt: string) {
		const activityEvent = this.withTurn(event);
		const activity = this.activity(activityEvent, observedAt);
		const signal = this.signal(activityEvent, observedAt);
		if (
			(event.kind === "idle" || (event.kind === "error" && !event.willRetry)) &&
			this.turn !== null &&
			this.turn.id === activityEvent.turnId
		)
			this.turn.open = false;
		const freshActivity = activity !== undefined && !this.activities.has(activity.id) ? activity : undefined;
		const freshSignal = signal !== undefined && !this.signals.has(signal.id) ? signal : undefined;
		if (freshActivity !== undefined) this.activities.add(freshActivity.id);
		if (freshSignal !== undefined) this.signals.add(freshSignal.id);
		return {
			...(event.kind === "message" && event.message !== undefined && !event.message.complete
				? {
						context: {
							id: this.messageId("assistant", activityEvent, event.message.text),
							kind: "message",
							role: "assistant",
							text: event.message.text,
							at: event.message.at ?? observedAt,
							turnId: activityEvent.turnId,
							completeness: "unproven",
						} satisfies RuntimeHarnessActivityContext,
					}
				: {}),
			...(freshActivity !== undefined ? { activity: freshActivity } : {}),
			...(freshSignal !== undefined ? { signal: freshSignal } : {}),
		};
	}

	private withTurn(event: HarnessEvent): HarnessEvent {
		if (event.turnId !== undefined) {
			if (this.turn === null || event.kind === "prompt" || event.kind === "working")
				this.turn = { id: event.turnId, open: true };
			return event;
		}
		if (this.turn === null || event.kind === "prompt" || (event.kind === "working" && !this.turn.open))
			this.turn = { id: `runtime-turn-${++this.turnSequence}`, open: true };
		return { ...event, turnId: this.turn.id };
	}

	private messageId(role: "user" | "assistant", event: HarnessEvent, text: string) {
		const id = event.activityId ?? event.message?.id;
		return `${role}:${id ?? `${event.turnId ?? "turn-unknown"}:${createHash("sha256").update(text).digest("hex")}`}`;
	}

	private activity(event: HarnessEvent, observedAt: string): RuntimeHarnessActivityItem | undefined {
		if (event.kind === "tool-start") {
			this.tools.set(event.tool!.id, { ...event.tool!, updates: [] });
			return;
		}
		if (event.kind === "tool-update") {
			const tool = event.tool!;
			const pending = this.tools.get(tool.id) ?? { id: tool.id, name: tool.name, updates: [] };
			if (tool.input !== undefined) pending.input = tool.input;
			if (tool.output !== undefined) pending.updates.push(tool.output);
			this.tools.set(tool.id, pending);
			return;
		}
		if (event.kind === "tool-end") {
			const tool = event.tool!;
			const pending = this.tools.get(tool.id);
			this.tools.delete(tool.id);
			return {
				id: `tool:${tool.id}`,
				kind: "tool",
				tool: {
					...pending,
					...tool,
					...(pending?.updates.length ? { updates: pending.updates } : {}),
				},
				...(event.error !== undefined ? { error: event.error } : {}),
				at: observedAt,
				...(event.turnId !== undefined ? { turnId: event.turnId } : {}),
			};
		}
		if (event.kind === "prompt")
			return {
				id: this.messageId("user", event, event.prompt!),
				kind: "message",
				role: "user",
				text: event.prompt!,
				at: observedAt,
				...(event.turnId !== undefined ? { turnId: event.turnId } : {}),
			};
		if (event.kind === "message" && event.message !== undefined) {
			const id = this.messageId("assistant", event, event.message.text);
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
				turnId: event.turnId,
			};
		}
		if (event.kind === "idle" && event.result) {
			if (event.resultActivityIds !== undefined) return;
			const id = this.messageId("assistant", event, event.result);
			const incomplete = this.incompleteMessages.get(event.turnId!);
			incomplete?.delete(id);
			if (incomplete?.size === 0) this.incompleteMessages.delete(event.turnId!);
			return {
				id,
				kind: "message",
				role: "assistant",
				text: event.result,
				at: observedAt,
				...(event.turnId !== undefined ? { turnId: event.turnId } : {}),
			};
		}
	}

	private signal(event: HarnessEvent, observedAt: string): RuntimeHarnessActivitySignal | undefined {
		if (event.kind === "input-resolved") {
			const prior = this.inputCycles.get(`input:${event.turnId}:${event.requestId}`);
			if (prior !== undefined) prior.open = false;
			return;
		}
		if (event.kind === "input-request") {
			const id = `input:${event.turnId}:${event.inputRequest!.id}`;
			const prior = this.inputCycles.get(id);
			const cycle = prior === undefined ? 1 : prior.cycle + (prior.open ? 0 : 1);
			this.inputCycles.set(id, { cycle, open: true });
			return {
				id: cycle === 1 ? id : `${id}:cycle:${cycle}`,
				kind: "input-request",
				request: event.inputRequest!,
				at: observedAt,
				...(event.turnId !== undefined ? { turnId: event.turnId } : {}),
			};
		}
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

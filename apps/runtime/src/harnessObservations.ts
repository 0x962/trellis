import { StringDecoder } from "node:string_decoder";
import type {
	HarnessEvent,
	RuntimeAgentMetadata,
	RuntimeHarnessObservation,
	RuntimeProcessStatus,
} from "@trellis/runtime-protocol";
import { SessionLog } from "./sessionLog.ts";

export class HarnessObservations {
	readonly log: SessionLog;
	agent: RuntimeAgentMetadata | null = null;
	activity: RuntimeProcessStatus["activity"] = null;
	private readonly tools = new Map<string, NonNullable<RuntimeAgentMetadata["lastTool"]>>();
	private sequence = 0;
	constructor(path: string) {
		this.log = new SessionLog(path);
		let offset = 0;
		let pending = "";
		const decoder = new StringDecoder("utf8");
		while (true) {
			const chunk = this.log.read(offset);
			if (chunk.data === "") break;
			offset = chunk.nextOffset;
			pending += decoder.write(Buffer.from(chunk.data, "base64"));
			let end = pending.indexOf("\n");
			while (end >= 0) {
				const observation = JSON.parse(pending.slice(0, end)) as RuntimeHarnessObservation;
				this.apply(observation.event, observation.observedAt);
				pending = pending.slice(end + 1);
				end = pending.indexOf("\n");
			}
		}
		pending += decoder.end();
		if (pending !== "") throw new Error("The provider event log has an incomplete record");
	}
	append(event: HarnessEvent, observedAt: string): boolean {
		const accepted = this.apply(event, observedAt);
		this.log.append(Buffer.from(`${JSON.stringify({ observedAt, event })}\n`));
		return accepted;
	}
	private apply(event: HarnessEvent, observedAt: string): boolean {
		this.sequence++;
		this.agent ??= {
			sessionId: null,
			model: null,
			turnId: null,
			tool: null,
			lastTool: null,
			lastMessage: null,
			tokenUsage: null,
			error: null,
			outcome: null,
		};
		const agent = this.agent;
		agent.attention ??= { sequence: 0, completion: null, failure: null, requests: [] };
		const attention = agent.attention;
		const begins = event.kind === "prompt" || event.kind === "working";
		if (!begins && event.turnId !== undefined && agent.turnId !== null && event.turnId !== agent.turnId) return false;
		attention.sequence = this.sequence;
		if (event.kind === "prompt" || (event.kind === "working" && event.turnId !== agent.turnId)) {
			attention.completion = null;
			attention.failure = null;
			attention.requests = [];
		}
		if (event.kind === "input-request" && !attention.requests.some((request) => request.id === event.inputRequest!.id))
			attention.requests.push({ ...event.inputRequest!, sequence: this.sequence, at: observedAt });
		if (event.kind === "input-resolved")
			attention.requests = attention.requests.filter((request) => request.id !== event.requestId);
		if (event.kind === "idle" || (event.kind === "error" && !event.willRetry)) {
			attention.requests = [];
			if (event.outcome === "completed" || event.outcome === "interrupted")
				attention.completion ??= { sequence: this.sequence, at: observedAt };
			if (event.outcome === "failed" || event.kind === "error")
				attention.failure ??= { sequence: this.sequence, at: observedAt };
		}
		if (
			event.kind === "prompt" ||
			(event.kind === "working" && event.turnId !== undefined && event.turnId !== agent.turnId)
		) {
			this.tools.clear();
			agent.error = null;
			agent.outcome = null;
			agent.tool = null;
		}
		if (event.kind === "prompt") agent.turnId = null;
		if (event.sessionId !== undefined) agent.sessionId = event.sessionId;
		if (event.model !== undefined) agent.model = event.model;
		if (event.tokenUsage !== undefined) agent.tokenUsage = event.tokenUsage;
		if (event.turnId !== undefined) agent.turnId = event.turnId;
		if (event.outcome !== undefined) agent.outcome = event.outcome;
		if (
			event.error !== undefined &&
			((event.kind === "error" && !event.willRetry) || (event.kind === "idle" && event.outcome === "failed"))
		)
			agent.error = event.error;
		if (event.kind === "idle" && event.outcome === "completed") agent.error = null;
		if (event.kind === "tool-start" || event.kind === "tool-update") agent.tool = event.tool!;
		if (event.kind === "idle" || (event.kind === "error" && !event.willRetry)) agent.tool = null;
		if (event.kind === "tool-end" && agent.tool?.id === event.tool!.id) agent.tool = null;
		if (event.kind === "tool-start" || event.kind === "tool-update" || event.kind === "tool-end") {
			const tool = event.tool!;
			const previous = this.tools.get(tool.id);
			const last = {
				...previous,
				...tool,
				startedAt: event.kind === "tool-start" ? observedAt : (previous?.startedAt ?? null),
				updatedAt: observedAt,
				status:
					event.kind === "tool-end"
						? event.error
							? ("failed" as const)
							: ("completed" as const)
						: ("running" as const),
				error: event.error ?? null,
			};
			agent.lastTool = last;
			if (event.kind === "tool-end") this.tools.delete(tool.id);
			else this.tools.set(tool.id, last);
		}
		if (event.message !== undefined) {
			const message = { text: event.message.text, at: event.message.at ?? observedAt };
			if (agent.lastMessage === null || message.at >= agent.lastMessage.at) agent.lastMessage = message;
		}
		// The result of an idle event is the final text of the turn. The Claude
		// Stop hook can read the transcript before that text is complete in the
		// file, so the message event just before the idle event can hold an
		// older message. The result then replaces it.
		if (event.kind === "idle" && event.result && event.result !== agent.lastMessage?.text)
			agent.lastMessage = { text: event.result, at: observedAt };
		// Codex can report the update and the end of a tool after the idle
		// event of the same turn. The turn is over, so those events leave the
		// agent idle.
		const lateToolEvent = (event.kind === "tool-update" || event.kind === "tool-end") && agent.outcome !== null;
		if (event.kind === "message") {
			if (this.activity !== null) this.activity = { ...this.activity, updatedAt: observedAt };
		} else if (
			!lateToolEvent &&
			event.kind !== "input-request" &&
			event.kind !== "input-resolved" &&
			(event.kind !== "session" || this.activity === null)
		) {
			const state =
				event.kind === "session"
					? "ready"
					: event.kind === "idle" || (event.kind === "error" && !event.willRetry)
						? "idle"
						: "working";
			this.activity = {
				state,
				updatedAt: observedAt,
				...(state === "working"
					? { workingSince: this.activity?.state === "working" ? this.activity.workingSince : observedAt }
					: {}),
			};
		}
		return true;
	}
}

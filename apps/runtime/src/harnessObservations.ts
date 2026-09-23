import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import type {
	HarnessEvent,
	RuntimeAgentMetadata,
	RuntimeHarnessObservation,
	RuntimeProcessStatus,
} from "@trellis/runtime-protocol";
import { SessionLog } from "./sessionLog.ts";

// The state that the events up to `offset` produced. `offset` is a position
// in the event log, so a load reads the events after it and reaches the same
// state as a read of the whole log.
type Checkpoint = {
	offset: number;
	sequence: number;
	agent: RuntimeAgentMetadata | null;
	activity: RuntimeProcessStatus["activity"];
	tools: NonNullable<RuntimeAgentMetadata["lastTool"]>[];
};

// Holds the agent state that the provider event log describes: the model, the
// session id, the tool that runs, the last message and the last error. The
// constructor rebuilds that state by reading every event of the log again.
// One agent writes megabytes of events, so `saveCheckpoint` writes the
// rebuilt state to its own small file, and a later load reads that file
// instead of the whole log.
export class HarnessObservations {
	readonly log: SessionLog;
	// True when the constructor loaded the state from a checkpoint file.
	readonly checkpointed: boolean;
	agent: RuntimeAgentMetadata | null = null;
	activity: RuntimeProcessStatus["activity"] = null;
	private readonly tools = new Map<string, NonNullable<RuntimeAgentMetadata["lastTool"]>>();
	private sequence = 0;
	private readonly checkpointPath: string | undefined;
	private readEnd = 0;
	constructor(path: string, checkpointPath?: string) {
		this.log = new SessionLog(path);
		this.checkpointPath = checkpointPath;
		let offset = 0;
		this.checkpointed = checkpointPath !== undefined && existsSync(checkpointPath);
		if (this.checkpointed) {
			const saved = JSON.parse(readFileSync(checkpointPath!, "utf8")) as Checkpoint;
			this.agent = saved.agent;
			this.activity = saved.activity;
			this.sequence = saved.sequence;
			for (const tool of saved.tools) this.tools.set(tool.id, tool);
			offset = saved.offset;
		}
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
		this.readEnd = offset;
	}
	// Writes the rebuilt state beside the event log. A session whose process
	// has gone never records another event, so the file stays correct.
	saveCheckpoint() {
		if (this.checkpointPath === undefined) return;
		const checkpoint: Checkpoint = {
			offset: this.readEnd,
			sequence: this.sequence,
			agent: this.agent,
			activity: this.activity,
			tools: [...this.tools.values()],
		};
		writeFileSync(`${this.checkpointPath}.tmp`, JSON.stringify(checkpoint), { mode: 0o600 });
		renameSync(`${this.checkpointPath}.tmp`, this.checkpointPath);
	}
	append(event: HarnessEvent, observedAt: string): boolean {
		const accepted = this.apply(event, observedAt);
		const line = Buffer.from(`${JSON.stringify({ observedAt, event })}\n`);
		this.log.append(line);
		// The checkpoint names the position this state covers, so the position
		// moves with every event the log takes.
		this.readEnd += line.length;
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
		if (event.kind === "idle" || (event.kind === "error" && !event.willRetry)) {
			this.tools.clear();
			agent.tool = null;
		}
		// Codex runs several commands at once. `agent.tool` and `lastTool` show
		// the newest tool that runs: an update to an older tool changes only its
		// entry in `this.tools`, and the end of the shown tool shows the newest
		// tool that still runs. `this.tools` keeps its tools in start order.
		if (event.kind === "tool-start" || event.kind === "tool-update" || event.kind === "tool-end") {
			const tool = event.tool!;
			const previous = this.tools.get(tool.id);
			const shown = agent.tool === null || agent.tool.id === tool.id || previous === undefined;
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
			if (event.kind === "tool-end") this.tools.delete(tool.id);
			else this.tools.set(tool.id, last);
			if (shown) {
				const running = event.kind === "tool-end" ? [...this.tools.values()].at(-1) : last;
				agent.tool = running ?? null;
				agent.lastTool = running ?? last;
			}
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

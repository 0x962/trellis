import { StringDecoder } from "node:string_decoder";
import type { HarnessEvent, RuntimeAgentMetadata, RuntimeHarnessObservation } from "@trellis/runtime-protocol";
import { SessionLog } from "./sessionLog.ts";

export class HarnessObservations {
	readonly log: SessionLog;
	agent: RuntimeAgentMetadata | null = null;
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
				this.apply((JSON.parse(pending.slice(0, end)) as RuntimeHarnessObservation).event);
				pending = pending.slice(end + 1);
				end = pending.indexOf("\n");
			}
		}
		pending += decoder.end();
		if (pending !== "") throw new Error("The provider event log has an incomplete record");
	}
	append(event: HarnessEvent, observedAt: string): boolean {
		const accepted = this.apply(event);
		this.log.append(Buffer.from(`${JSON.stringify({ observedAt, event })}\n`));
		return accepted;
	}
	private apply(event: HarnessEvent): boolean {
		this.agent ??= {
			sessionId: null,
			model: null,
			turnId: null,
			tool: null,
			error: null,
			outcome: null,
		};
		const agent = this.agent;
		const begins = event.kind === "prompt" || event.kind === "working";
		if (!begins && event.turnId !== undefined && agent.turnId !== null && event.turnId !== agent.turnId) return false;
		if (
			event.kind === "prompt" ||
			(event.kind === "working" && event.turnId !== undefined && event.turnId !== agent.turnId)
		) {
			agent.error = null;
			agent.outcome = null;
			agent.tool = null;
		}
		if (event.kind === "prompt") agent.turnId = null;
		if (event.sessionId !== undefined) agent.sessionId = event.sessionId;
		if (event.model !== undefined) agent.model = event.model;
		if (event.turnId !== undefined) agent.turnId = event.turnId;
		if (event.outcome !== undefined) agent.outcome = event.outcome;
		if (event.error !== undefined) agent.error = event.error;
		if (event.kind === "tool-start" || event.kind === "tool-update") agent.tool = event.tool!;
		if (event.kind === "idle" || event.kind === "error") agent.tool = null;
		if (event.kind === "tool-end" && agent.tool?.id === event.tool!.id) agent.tool = null;
		return true;
	}
}

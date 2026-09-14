import { boundedText } from "./boundedText.ts";
import type { ClaudeCheckpoint } from "./checkpoint.ts";
import type { HarnessEvent, HarnessSnapshot } from "./types.ts";

export class ClaudeStream {
	private buffer = Buffer.alloc(0);
	private readonly value: HarnessSnapshot;
	private invalid = false;
	constructor(
		sessionId: string,
		private readonly initializeId?: string,
		restore?: { snapshot: HarnessSnapshot; checkpoint: ClaudeCheckpoint },
	) {
		this.value = {
			sessionId,
			state: "unknown",
			acknowledgedMessageIds: [],
			pendingPermissions: [],
			transcript: [],
			result: null,
			error: null,
		};
		if (restore) {
			Object.assign(this.value, structuredClone(restore.snapshot), {
				state: restore.checkpoint.state,
				error: restore.checkpoint.error,
			});
			this.buffer = Buffer.from(restore.checkpoint.pendingBytes, "base64");
			this.invalid = restore.checkpoint.invalid;
		}
	}
	checkpoint(offset: number): ClaudeCheckpoint {
		return {
			offset,
			pendingBytes: this.buffer.toString("base64"),
			invalid: this.invalid,
			state: this.value.state,
			error: this.value.error,
		};
	}
	snapshot(): HarnessSnapshot {
		return structuredClone(this.value);
	}
	gap(reason = "Earlier harness output expired; delivery receipt is unknown") {
		this.invalid = true;
		this.value.state = "unknown";
		this.value.error = reason;
	}
	feed(bytes: Buffer): HarnessEvent[] {
		this.buffer = Buffer.concat([this.buffer, bytes]);
		const events: HarnessEvent[] = [];
		while (this.buffer.includes(10)) {
			const end = this.buffer.indexOf(10);
			if (end > 2_000_000) this.gap("Harness JSON record exceeds the byte limit");
			const line = this.buffer.subarray(0, end).toString("utf8");
			this.buffer = this.buffer.subarray(end + 1);
			if (line.trim() === "") continue;
			let row: Record<string, unknown>;
			try {
				row = JSON.parse(line);
			} catch {
				this.gap("Harness output contains invalid JSON");
				continue;
			}
			if (!row || typeof row !== "object") {
				this.gap("Harness output is not a JSON object");
				continue;
			}
			if (typeof row.session_id === "string" && row.session_id !== this.value.sessionId) {
				this.gap("Harness session identifier differs from this attempt");
				continue;
			}
			if (this.invalid) continue;
			this.accept(row, events);
		}
		if (this.buffer.length > 2_000_000) {
			this.gap("Harness JSON record exceeds the byte limit");
			this.buffer = Buffer.alloc(0);
		}
		return events;
	}
	private transcript(row: Record<string, unknown>, role: "user" | "assistant") {
		const message = row.message as { content?: unknown } | undefined;
		const text =
			typeof message?.content === "string"
				? message.content
				: Array.isArray(message?.content)
					? message.content
							.filter((block) => block.type === "text" && typeof block.text === "string")
							.map((block) => block.text)
							.join("\n")
					: "";
		if (text === "") return;
		const messageId = typeof row.uuid === "string" ? row.uuid : undefined;
		if (messageId !== undefined && this.value.transcript.some((message) => message.messageId === messageId)) return;
		const bounded = boundedText(text);
		this.value.transcript.push({ role, text: bounded.text, messageId });
		if (bounded.truncated) this.value.transcriptTruncated = true;
		while (this.value.transcript.reduce((size, message) => size + Buffer.byteLength(message.text), 0) > 512 * 1024) {
			this.value.transcript.shift();
			this.value.transcriptTruncated = true;
		}
	}
	private accept(row: Record<string, unknown>, events: HarnessEvent[]) {
		if (
			["system", "user", "assistant", "result"].includes(String(row.type)) &&
			row.session_id !== this.value.sessionId
		) {
			this.gap("Harness event has no matching session identifier");
			return;
		}
		if (row.type === "control_response") {
			const response = row.response as Record<string, unknown> | undefined;
			if (!response) {
				this.gap("Harness control response is malformed");
				return;
			}
			if (this.value.pendingPermissions.some((permission) => permission.requestId === response?.request_id)) {
				this.value.pendingPermissions = this.value.pendingPermissions.filter(
					(permission) => permission.requestId !== response?.request_id,
				);
				this.value.state = this.value.pendingPermissions.length > 0 ? "needs_input" : "working";
				return;
			}
			if (response?.request_id !== this.initializeId || this.initializeId === undefined) return;
			if (response.subtype === "success") {
				this.value.state = "ready";
				events.push({ type: "ready" });
			} else {
				this.value.state = "failed";
				this.value.error = String(response.error);
			}
		} else if (row.type === "system" && row.subtype === "init") {
			this.value.state = "ready";
			events.push({ type: "ready" });
		} else if (
			row.type === "user" &&
			row.isReplay === true &&
			typeof row.uuid === "string" &&
			row.parent_tool_use_id == null
		) {
			this.transcript(row, "user");
			if (!this.value.acknowledgedMessageIds.includes(row.uuid)) this.value.acknowledgedMessageIds.push(row.uuid);
			this.value.acknowledgedMessageIds = this.value.acknowledgedMessageIds.slice(-128);
			this.value.state = "working";
			events.push({ type: "acknowledged", messageId: row.uuid });
		} else if (row.type === "assistant" && row.parent_tool_use_id == null) {
			this.transcript(row, "assistant");
			if (this.value.pendingPermissions.length === 0) this.value.state = "working";
		} else if (row.type === "control_request") {
			const request = row.request as Record<string, unknown> | undefined;
			if (
				!request ||
				typeof row.request_id !== "string" ||
				typeof request.tool_name !== "string" ||
				!request.input ||
				typeof request.input !== "object"
			) {
				this.gap("Harness permission request is malformed");
				return;
			}
			if (request.subtype !== "can_use_tool") {
				this.gap(`Unsupported harness control request: ${String(request.subtype)}`);
				return;
			}
			const permission = {
				requestId: String(row.request_id),
				toolName: String(request.tool_name),
				toolUseId: typeof request.tool_use_id === "string" ? request.tool_use_id : null,
				input: request.input as Record<string, unknown>,
			};
			this.value.pendingPermissions.push(permission);
			this.value.state = "needs_input";
			events.push({ type: "permission", permission });
		} else if (row.type === "control_cancel_request") {
			this.value.pendingPermissions = this.value.pendingPermissions.filter(
				(permission) => permission.requestId !== row.request_id,
			);
			this.value.state = "unknown";
		} else if (row.type === "result") {
			this.value.resultId = typeof row.uuid === "string" ? row.uuid : null;
			const result = typeof row.result === "string" ? boundedText(row.result) : null;
			this.value.result = result?.text ?? null;
			this.value.resultTruncated = result?.truncated ?? false;
			const denied = Array.isArray(row.permission_denials) && row.permission_denials.length > 0;
			this.value.state = denied
				? "needs_input"
				: row.subtype === "success" && row.is_error !== true
					? "idle"
					: "failed";
			this.value.error = denied
				? "The agent could not use a tool because permission was denied"
				: this.value.state === "failed"
					? Array.isArray(row.errors)
						? row.errors.join("\n")
						: String(row.subtype)
					: null;
			this.value.pendingPermissions = [];
			events.push({ type: "result", state: this.value.state, result: this.value.result });
		}
	}
}

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	RuntimeExpectedTurn,
	RuntimeListInput,
	RuntimeProcessStatus,
	RuntimeStream,
} from "@trellis/runtime-protocol";
import { z } from "zod";
import { interruptHarness } from "./interruptHarness.ts";
import { prepareAttempt } from "./prepareAttempt.ts";
import { sendNativePrompt } from "./sendNativePrompt.ts";
import type { HarnessDescriptor, HarnessHostOptions, HarnessStarted, HarnessStartInput } from "./types.ts";

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const launchInput = z
	.object({
		id: identifier,
		harness: z.enum(["claude", "codex", "pi", "opencode", "muse"]),
		managerId: identifier.optional(),
		cwd: z.string().startsWith("/"),
		prompt: z.string().min(1),
		model: z.string().min(1).optional(),
		token: z.string().min(1).optional(),
		timeoutMs: z.number().positive().optional(),
	})
	.and(
		z.union([
			z.object({ kind: z.literal("manager"), managerSystemPrompt: z.string().min(1) }),
			z.object({ kind: z.enum(["builder", "reviewer"]).optional() }),
		]),
	);
export class HarnessHost {
	constructor(private readonly options: HarnessHostOptions) {}
	prepare(input: HarnessStartInput, sessionId?: string): Promise<HarnessDescriptor> {
		launchInput.parse(input);
		if (sessionId !== undefined) z.string().min(1).parse(sessionId);
		return prepareAttempt(this.options, input, sessionId);
	}
	start(input: HarnessStartInput): Promise<HarnessStarted> {
		return this.launch(input);
	}
	resume(input: HarnessStartInput & { sessionId: string }): Promise<HarnessStarted> {
		z.string().min(1).parse(input.sessionId);
		return this.launch(input, input.sessionId);
	}
	private async launch(input: HarnessStartInput, sessionId?: string): Promise<HarnessStarted> {
		const descriptor = await this.prepare(input, sessionId);
		return this.launchDescriptor({ ...descriptor, prompt: input.prompt, sessionId });
	}
	async startPrepared(id: string, timeoutMs?: number): Promise<HarnessStarted> {
		const descriptor = await this.descriptor(id);
		const exists = (await this.options.runtime.list()).some((process) => process.id === id);
		return this.launchDescriptor(descriptor, timeoutMs, !exists);
	}
	private async launchDescriptor(
		descriptor: HarnessDescriptor,
		timeoutMs?: number,
		start = true,
	): Promise<HarnessStarted> {
		const { spec, harness, sessionId, prompt } = descriptor;
		if (start) await this.options.runtime.start(timeoutMs === undefined ? spec : { ...spec, timeoutMs });
		if (harness === "opencode" && sessionId !== undefined) {
			const current = await this.waitFor(spec.id, (state) => state.agent?.sessionId === sessionId);
			if (!current.acknowledgedMessageIds.includes(spec.id))
				await sendNativePrompt(this.options, descriptor, sessionId, spec.id, `trellis-message:${spec.id}\n${prompt}`);
		}
		const process = await this.waitFor(
			spec.id,
			(state) => state.agent?.sessionId != null && state.acknowledgedMessageIds.includes(spec.id),
		);
		if (sessionId !== undefined && process.agent?.sessionId !== sessionId)
			throw new Error(
				`Harness attempt ${spec.id} resumed provider session ${process.agent?.sessionId}, expected ${sessionId}`,
			);
		return { process };
	}

	async waitFor(
		id: string,
		matches: (session: RuntimeProcessStatus) => boolean,
		options: { rejectAgentError?: boolean } = {},
	): Promise<RuntimeProcessStatus> {
		const timeoutMs = this.options.observationTimeoutMs ?? 15000;
		const controller = new AbortController();
		const signal = controller.signal;
		let lastProgressAt = Date.now();
		let timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			for await (const event of this.options.runtime.subscribeSession(id, signal)) {
				if (event.type !== "session") continue;
				const progressAt = Math.max(
					event.session.agent?.lastTool ? Date.parse(event.session.agent.lastTool.updatedAt) : 0,
					event.session.agent?.lastMessage ? Date.parse(event.session.agent.lastMessage.at) : 0,
				);
				if (progressAt > lastProgressAt) {
					lastProgressAt = progressAt;
					clearTimeout(timer);
					timer = setTimeout(() => controller.abort(), timeoutMs);
				}
				if (matches(event.session)) return event.session;
				if (
					event.session.status === "exited" ||
					event.session.error ||
					(options.rejectAgentError !== false && event.session.agent?.error)
				)
					throw new Error(
						`Harness attempt ${id}: ${event.session.agent?.error ?? event.session.error ?? event.session.status}`,
					);
			}
		} catch (error) {
			if (!signal.aborted) throw error;
			throw Object.assign(
				new Error(
					`Harness attempt ${id} made no observed progress for ${timeoutMs} ms while waiting for provider confirmation. Inspect its terminal and provider events. Stop the attempt before you send again.`,
				),
				{ code: "HARNESS_OBSERVATION_TIMEOUT" },
			);
		} finally {
			clearTimeout(timer);
		}
		throw new Error(`Harness attempt ${id} closed before the requested provider observation`);
	}
	status(id: string) {
		return this.options.runtime.inspect(id);
	}
	list(input: RuntimeListInput = {}) {
		return this.options.runtime.list(input);
	}
	output(id: string, offset = 0, stream: RuntimeStream = "stdout") {
		return this.options.runtime.output(id, offset, stream);
	}
	subscribe(id: string, offset = 0, signal?: AbortSignal, stream: RuntimeStream = "stdout") {
		return this.options.runtime.subscribe(id, offset, signal, stream);
	}
	input(id: string, text: string, userInput = true) {
		return this.options.runtime.input(id, Buffer.from(text).toString("base64"), userInput);
	}
	resize(id: string, cols: number, rows: number) {
		return this.options.runtime.resize(id, cols, rows);
	}
	stop(id: string) {
		return this.options.runtime.stop(id);
	}
	private async descriptor(id: string): Promise<HarnessDescriptor> {
		identifier.parse(id);
		return JSON.parse(await readFile(join(this.options.directory, id, "launch.json"), "utf8"));
	}
	// A message that arrives during a turn waits in the harness's own input
	// queue. The harness hook acknowledges the message id when that message
	// starts a turn, so `acknowledgedMessageIds` proves a started turn. A
	// return from send proves only that the harness accepted the text. A
	// message id that an earlier send registered without a confirmed write
	// stays uncertain: the text may already be in the queue, so send refuses
	// to hand it over again.
	async send(id: string, text: string, messageId: string = randomUUID(), expected?: RuntimeExpectedTurn) {
		identifier.parse(messageId);
		const descriptor = await this.descriptor(id);
		let status: "unknown" | "written" | "acknowledged";
		if (descriptor.harness === "opencode" || descriptor.harness === "codex" || descriptor.harness === "muse") {
			const sessionId = (await this.status(id)).agent?.sessionId;
			if (sessionId == null) throw new Error(`Harness attempt ${id} has no provider session identity`);
			const reservation = await sendNativePrompt(
				this.options,
				descriptor,
				sessionId,
				messageId,
				`trellis-message:${messageId}\n${text}`,
				expected,
			);
			status = reservation.claimed ? "written" : reservation.status;
		} else {
			const delivery = await this.options.runtime.deliver(
				id,
				messageId,
				Buffer.from(`\u001b[200~trellis-message:${messageId}\n${text}\u001b[201~\r`).toString("base64"),
				expected,
			);
			status = delivery.status;
		}
		if (status === "unknown")
			throw Object.assign(
				new Error(
					`Harness attempt ${id} message ${messageId} has an unconfirmed earlier delivery; inspect the agent before a resend`,
				),
				{ code: "HARNESS_DELIVERY_UNKNOWN" },
			);
		return this.status(id);
	}
	async interrupt(id: string, { waitForIdle = true } = {}) {
		const descriptor = await this.descriptor(id);
		const before = await this.status(id);
		const result = await interruptHarness(this.options, descriptor, before, waitForIdle);
		if (!waitForIdle) return before;
		return (
			result ?? this.waitFor(id, (state) => state.activity?.state === "idle" && state.agent?.outcome === "interrupted")
		);
	}
}

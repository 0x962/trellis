import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeListInput, RuntimeProcessStatus, RuntimeStream } from "@trellis/runtime-protocol";
import { z } from "zod";
import { interruptHarness } from "./interruptHarness.ts";
import { prepareAttempt } from "./prepareAttempt.ts";
import { sendNativePrompt } from "./sendNativePrompt.ts";
import type { HarnessDescriptor, HarnessHostOptions, HarnessStarted, HarnessStartInput } from "./types.ts";

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const launchInput = z.object({
	id: identifier,
	harness: z.enum(["claude", "codex", "pi", "opencode"]),
	cwd: z.string().startsWith("/"),
	prompt: z.string().min(1),
	model: z.string().min(1).optional(),
	token: z.string().min(1).optional(),
	timeoutMs: z.number().positive().optional(),
});
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
		await this.options.runtime.start(descriptor.spec);
		if (input.harness === "opencode" && sessionId !== undefined) {
			const current = await this.waitFor(input.id, (state) => state.agent?.sessionId === sessionId);
			if (!current.acknowledgedMessageIds.includes(input.id))
				await sendNativePrompt(
					this.options,
					descriptor,
					sessionId,
					input.id,
					`trellis-message:${input.id}\n${input.prompt}`,
				);
		}
		const process = await this.waitFor(
			input.id,
			(state) => state.agent?.sessionId != null && state.acknowledgedMessageIds.includes(input.id),
		);
		if (sessionId !== undefined && process.agent?.sessionId !== sessionId)
			throw new Error(
				`Harness attempt ${input.id} resumed provider session ${process.agent?.sessionId}, expected ${sessionId}`,
			);
		return { process };
	}
	async waitFor(id: string, matches: (session: RuntimeProcessStatus) => boolean): Promise<RuntimeProcessStatus> {
		const signal = AbortSignal.timeout(this.options.observationTimeoutMs ?? 15000);
		try {
			for await (const event of this.options.runtime.subscribeSession(id, signal)) {
				if (event.type !== "session") continue;
				if (matches(event.session)) return event.session;
				if (event.session.status === "exited" || event.session.error || event.session.agent?.error)
					throw new Error(
						`Harness attempt ${id}: ${event.session.agent?.error ?? event.session.error ?? event.session.status}`,
					);
			}
		} catch (error) {
			if (!signal.aborted) throw error;
			throw Object.assign(
				new Error(
					`Harness attempt ${id} did not confirm the requested provider observation within ${this.options.observationTimeoutMs ?? 15000} ms; inspect or stop this attempt before resending`,
				),
				{ code: "HARNESS_OBSERVATION_TIMEOUT" },
			);
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
	async send(id: string, text: string, messageId: string = randomUUID()) {
		identifier.parse(messageId);
		const descriptor = await this.descriptor(id);
		if (descriptor.harness === "opencode" || descriptor.harness === "codex") {
			const sessionId = (await this.status(id)).agent?.sessionId;
			if (sessionId == null) throw new Error(`Harness attempt ${id} has no provider session identity`);
			await sendNativePrompt(this.options, descriptor, sessionId, messageId, `trellis-message:${messageId}\n${text}`);
		} else {
			await this.options.runtime.deliver(
				id,
				messageId,
				Buffer.from(`\u001b[200~trellis-message:${messageId}\n${text}\u001b[201~\r`).toString("base64"),
				true,
			);
		}
		return this.waitFor(id, (state) => state.acknowledgedMessageIds.includes(messageId));
	}
	async interrupt(id: string) {
		const descriptor = await this.descriptor(id);
		const result = await interruptHarness(this.options, descriptor, await this.status(id));
		return (
			result ?? this.waitFor(id, (state) => state.activity?.state === "idle" && state.agent?.outcome === "interrupted")
		);
	}
}

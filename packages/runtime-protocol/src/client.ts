import { randomUUID } from "node:crypto";
import { Socket } from "node:net";
import {
	type HarnessEvent,
	type LaunchSpec,
	listLimit,
	RUNTIME_PROTOCOL_VERSION,
	type RuntimeExpectedTurn,
	type RuntimeListInput,
	type RuntimeListPage,
	type RuntimeListPageInput,
	type RuntimeMethod,
	type RuntimeMethods,
	type RuntimeProcessStatus,
	type RuntimeResponse,
	type RuntimeSessionList,
	type RuntimeStream,
} from "./index.ts";
import { subscribeOutput } from "./subscribeOutput.ts";
import { terminalChannel } from "./terminalChannel";

export class RuntimeClient {
	private capabilities: string[] | undefined;
	constructor(
		readonly socketPath: string,
		readonly timeoutMs?: number,
	) {}
	call<M extends RuntimeMethod>(
		method: M,
		params: RuntimeMethods[M]["params"],
		signal?: AbortSignal,
	): Promise<RuntimeMethods[M]["result"]> {
		return new Promise((resolve, reject) => {
			signal?.throwIfAborted();
			const socket = new Socket();
			const id = randomUUID();
			const chunks: string[] = [];
			let settled = false;
			const cleanup = () => {
				signal?.removeEventListener("abort", abort);
				socket.setTimeout(0);
			};
			const fail = (error: unknown) => {
				if (settled) return;
				settled = true;
				cleanup();
				socket.destroy();
				reject(error);
			};
			const abort = () => fail(signal!.reason);
			signal?.addEventListener("abort", abort, { once: true });
			socket.setEncoding("utf8");
			if (this.timeoutMs !== undefined)
				socket.setTimeout(this.timeoutMs, () =>
					fail(
						Object.assign(new Error(`Runtime ${method} response is unknown: request timed out`), {
							code: "RUNTIME_TIMEOUT",
						}),
					),
				);
			socket.once("error", fail);
			socket.once("close", () => {
				if (!settled) fail(new Error(`Runtime ${method} response is unknown: connection closed`));
			});
			socket.once("connect", () =>
				socket.write(`${JSON.stringify({ id, version: RUNTIME_PROTOCOL_VERSION, method, params })}\n`),
			);
			socket.on("data", (chunk) => {
				if (settled) return;
				const text = chunk.toString();
				chunks.push(text);
				if (!text.includes("\n")) return;
				const buffer = chunks.join("");
				const end = buffer.indexOf("\n");
				let reply: RuntimeResponse;
				try {
					reply = JSON.parse(buffer.slice(0, end));
				} catch (error) {
					fail(error as Error);
					return;
				}
				if (reply.id !== id) {
					fail(new Error("Runtime response identifier mismatch"));
					return;
				}
				settled = true;
				cleanup();
				socket.end();
				if ("error" in reply) reject(Object.assign(new Error(reply.error.message), { code: reply.error.code }));
				else resolve(reply.result as RuntimeMethods[M]["result"]);
			});
			socket.connect(this.socketPath);
		});
	}
	subscribe(id: string, offset = 0, signal?: AbortSignal, stream: RuntimeStream = "stdout") {
		return subscribeOutput(this.socketPath, { id, offset, stream }, signal);
	}
	subscribeSession(id: string, signal?: AbortSignal) {
		return subscribeOutput(this.socketPath, { id, offset: 0, output: false }, signal);
	}
	terminal(id: string, offset = 0, signal?: AbortSignal) {
		return terminalChannel(this.socketPath, id, offset, signal);
	}
	registerNativeDelivery(
		id: string,
		token: string,
		messageId: string,
		promptDigest: string,
		expected?: RuntimeExpectedTurn,
	) {
		return this.call("registerNativeDelivery", { id, token, messageId, promptDigest, expected });
	}
	observe(id: string, token: string, event: HarnessEvent, expected?: RuntimeExpectedTurn) {
		return this.call("observe", { id, token, event, expected });
	}
	turn(
		id: string,
		token: string,
		event: "SessionStart" | "UserPromptSubmit" | "Stop",
		messageId?: string,
		result?: string,
	) {
		return this.call("turn", { id, token, event, messageId, result });
	}
	inspect(id: string) {
		return this.call("inspect", { id });
	}
	recover(id: string) {
		return this.call("recover", { id });
	}
	hasMessage(id: string, messageId: string) {
		return this.call("hasMessage", { id, messageId });
	}
	shutdown() {
		return this.call("shutdown", {});
	}
	async hello(signal?: AbortSignal) {
		const hello = await this.call("hello", {}, signal);
		this.capabilities = hello.capabilities ?? [];
		return hello;
	}
	// An explicit timeoutMs preserves completed pages with complete=false.
	// Cancellation rejects the whole list, including its hello request.
	async list(input: RuntimeListInput = {}, signal?: AbortSignal): Promise<RuntimeSessionList> {
		signal?.throwIfAborted();
		if (this.capabilities === undefined) await this.hello(signal);
		if (!this.capabilities!.includes("list-pages"))
			return { sessions: await this.call("list", input, signal), complete: true };
		const limit = listLimit(input);
		const sessions: RuntimeProcessStatus[] = [];
		let cursor: string | undefined;
		do {
			let page: RuntimeListPage;
			try {
				page = await this.listPage({ ...input, limit: limit - sessions.length, cursor }, signal);
			} catch (error) {
				signal?.throwIfAborted();
				if ((error as { code?: string }).code !== "RUNTIME_TIMEOUT") throw error;
				return { sessions, complete: false };
			}
			for (const session of page.sessions) sessions.push(session);
			cursor = page.nextCursor ?? undefined;
		} while (cursor !== undefined && sessions.length < limit);
		return { sessions, complete: true };
	}
	listPage(input: RuntimeListPageInput = {}, signal?: AbortSignal) {
		return this.call("listPage", input, signal);
	}
	start(spec: LaunchSpec) {
		return this.call("start", spec);
	}
	input(id: string, data: string, userInput?: boolean, expected?: RuntimeExpectedTurn) {
		return this.call("input", { id, data, userInput, expected });
	}
	deliver(id: string, messageId: string, data: string, expected?: RuntimeExpectedTurn) {
		return this.call("deliver", { id, messageId, data, expected });
	}
	queueInput(id: string, messageId: string, data: string) {
		return this.call("queueInput", { id, messageId, data });
	}
	resize(id: string, cols: number, rows: number) {
		return this.call("resize", { id, cols, rows });
	}
	stop(id: string) {
		return this.call("stop", { id });
	}
	output(id: string, offset = 0, stream: RuntimeStream = "stdout") {
		return this.call("output", { id, offset, stream });
	}
}

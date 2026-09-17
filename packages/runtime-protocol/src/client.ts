import { randomUUID } from "node:crypto";
import { Socket } from "node:net";
import {
	type HarnessEvent,
	type LaunchSpec,
	RUNTIME_PROTOCOL_VERSION,
	type RuntimeExpectedTurn,
	type RuntimeListInput,
	type RuntimeMethod,
	type RuntimeMethods,
	type RuntimeResponse,
	type RuntimeStream,
} from "./index.ts";
import { subscribeOutput } from "./subscribeOutput.ts";

export class RuntimeClient {
	constructor(
		readonly socketPath: string,
		readonly timeoutMs = 10_000,
	) {}
	call<M extends RuntimeMethod>(method: M, params: RuntimeMethods[M]["params"]): Promise<RuntimeMethods[M]["result"]> {
		return new Promise((resolve, reject) => {
			const socket = new Socket();
			const id = randomUUID();
			const chunks: string[] = [];
			let settled = false;
			const fail = (error: Error) => {
				if (settled) return;
				settled = true;
				socket.destroy();
				reject(error);
			};
			socket.setEncoding("utf8");
			socket.setTimeout(this.timeoutMs, () =>
				fail(new Error(`Runtime ${method} response is unknown: request timed out`)),
			);
			socket.once("error", fail);
			socket.once("close", () => {
				if (!settled) fail(new Error(`Runtime ${method} response is unknown: connection closed`));
			});
			socket.once("connect", () =>
				socket.write(`${JSON.stringify({ id, version: RUNTIME_PROTOCOL_VERSION, method, params })}\n`),
			);
			socket.on("data", (chunk) => {
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
	hasMessage(id: string, messageId: string) {
		return this.call("hasMessage", { id, messageId });
	}
	shutdown() {
		return this.call("shutdown", {});
	}
	hello() {
		return this.call("hello", {});
	}
	list(input: RuntimeListInput = {}) {
		return this.call("list", input);
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

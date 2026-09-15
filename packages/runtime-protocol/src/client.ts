import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import {
	type LaunchSpec,
	RUNTIME_PROTOCOL_VERSION,
	type RuntimeMethod,
	type RuntimeMethods,
	type RuntimeResponse,
} from "./index.ts";
import { subscribeOutput } from "./subscribeOutput.ts";

export class RuntimeClient {
	constructor(
		readonly socketPath: string,
		readonly timeoutMs = 10_000,
	) {}
	call<M extends RuntimeMethod>(method: M, params: RuntimeMethods[M]["params"]): Promise<RuntimeMethods[M]["result"]> {
		return new Promise((resolve, reject) => {
			const socket = createConnection(this.socketPath);
			const id = randomUUID();
			let buffer = "";
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
				buffer += chunk;
				if (buffer.length > 3_000_000) {
					fail(new Error("Runtime response exceeds the byte limit"));
					return;
				}
				const end = buffer.indexOf("\n");
				if (end < 0) return;
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
		});
	}
	subscribe(id: string, offset = 0, signal?: AbortSignal, stream: "stdout" | "stderr" = "stdout") {
		return subscribeOutput(this.socketPath, { id, offset, stream }, signal);
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
	shutdown() {
		return this.call("shutdown", {});
	}
	hello() {
		return this.call("hello", {});
	}
	list() {
		return this.call("list", {});
	}
	start(spec: LaunchSpec) {
		return this.call("start", spec);
	}
	input(id: string, data: string) {
		return this.call("input", { id, data });
	}
	deliver(id: string, messageId: string, data: string, requireIdle?: boolean) {
		return this.call("deliver", { id, messageId, data, requireIdle });
	}
	resize(id: string, cols: number, rows: number) {
		return this.call("resize", { id, cols, rows });
	}
	stop(id: string) {
		return this.call("stop", { id });
	}
	output(id: string, offset = 0, stream: "stdout" | "stderr" = "stdout") {
		return this.call("output", { id, offset, stream });
	}
}

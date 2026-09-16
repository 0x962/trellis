import type { ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";

const envelope = z.looseObject({ id: z.union([z.string(), z.number()]).optional(), method: z.string().optional() });

// A JSON-RPC client for one `muse serve` process. The Muse Session Protocol
// (MSP) runs over the stdin and stdout of that process, one JSON object per
// line. The bridge is its only client.
//
// A message with an id and no method answers a request of ours. A message
// with a method and no id is a notification. A message with both is a
// request from Muse, such as an approval question, and `handleRequest`
// answers it.
export class MspClient {
	private nextId = 0;
	private readonly pending = new Map<
		number,
		{ resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
	>();
	readonly closed: Promise<never>;
	constructor(
		private readonly child: ChildProcess,
		notify: (message: { method: string; params?: unknown }) => void,
		handleRequest?: (message: { id: string | number; method: string; params?: unknown }) => Promise<unknown>,
	) {
		let fail!: (error: Error) => void;
		this.closed = new Promise((_, reject) => {
			fail = (error: Error) => {
				for (const request of this.pending.values()) {
					clearTimeout(request.timer);
					request.reject(error);
				}
				this.pending.clear();
				reject(error);
			};
		});
		child.once("error", fail);
		child.once("exit", (code, signal) => fail(new Error(`Muse session host exited: ${signal ?? code}`)));
		child.stdin!.on("error", fail);
		const lines = createInterface({ input: child.stdout!, crlfDelay: Infinity });
		lines.on("line", (line) => {
			if (line.trim() === "") return;
			const message = envelope.parse(JSON.parse(line));
			if (typeof message.id === "number" && message.method === undefined) {
				const request = this.pending.get(message.id);
				if (!request) throw new Error(`Muse answered an unknown request ${message.id}`);
				this.pending.delete(message.id);
				clearTimeout(request.timer);
				if (message.error !== undefined)
					request.reject(new Error(`Muse request failed: ${JSON.stringify(message.error)}`));
				else request.resolve(message.result);
			} else if (message.id === undefined && message.method !== undefined) {
				notify({ method: message.method, params: message.params });
			} else if (message.id !== undefined && message.method !== undefined && handleRequest) {
				void handleRequest({ id: message.id, method: message.method, params: message.params })
					.then((result) => this.write({ jsonrpc: "2.0", id: message.id, result: result ?? {} }))
					.catch((error) => {
						fail(error instanceof Error ? error : new Error(String(error)));
						child.kill("SIGKILL");
					});
			}
		});
	}
	private write(message: unknown) {
		this.child.stdin!.write(`${JSON.stringify(message)}\n`);
	}
	// Returns the Muse home of the host: the data directory that holds its
	// sessions.
	async initialize() {
		const result = z
			.looseObject({ schema: z.looseObject({ version: z.number() }), museHome: z.string() })
			.parse(await this.request("initialize", { clientInfo: { name: "trellis_host", version: "1" } }));
		if (result.schema.version !== 1)
			throw new Error(`Muse speaks session protocol schema ${result.schema.version}; this host speaks 1`);
		this.notify("initialized", {});
		return { museHome: result.museHome };
	}
	request(method: string, params: unknown): Promise<unknown> {
		const id = ++this.nextId;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Muse ${method} response is unknown: request timed out`));
				this.child.kill("SIGKILL");
			}, 15000);
			this.pending.set(id, { resolve, reject, timer });
			this.write({ jsonrpc: "2.0", id, method, params });
		});
	}
	notify(method: string, params: unknown) {
		this.write({ jsonrpc: "2.0", method, params });
	}
	close() {
		this.child.stdin!.end();
	}
}

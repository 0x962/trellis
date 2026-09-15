import WebSocket from "ws";
import { z } from "zod";

const envelope = z.looseObject({ id: z.union([z.string(), z.number()]).optional(), method: z.string().optional() });
export class CodexAppServerClient {
	private nextId = 0;
	private readonly pending = new Map<
		number,
		{ resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
	>();
	private readonly socket: WebSocket;
	readonly opened: Promise<void>;
	readonly closed: Promise<never>;
	constructor(path: string, notify: (message: unknown) => void) {
		this.socket = new WebSocket(`ws+unix://${path}:/`, { perMessageDeflate: false, maxPayload: 16 * 1024 * 1024 });
		this.opened = new Promise((resolve, reject) => {
			this.socket.once("open", resolve);
			this.socket.once("error", reject);
		});
		this.closed = new Promise((_, reject) => {
			const fail = (error: Error) => {
				for (const request of this.pending.values()) {
					clearTimeout(request.timer);
					request.reject(error);
				}
				this.pending.clear();
				reject(error);
			};
			this.socket.once("error", fail);
			this.socket.once("close", () => fail(new Error("Codex app-server connection closed")));
		});
		this.socket.on("message", (data) => {
			const message = envelope.parse(JSON.parse(data.toString()));
			if (typeof message.id === "number" && message.method === undefined) {
				const request = this.pending.get(message.id);
				if (!request) throw new Error(`Codex returned unknown request ${message.id}`);
				this.pending.delete(message.id);
				clearTimeout(request.timer);
				if (message.error !== undefined)
					request.reject(new Error(`Codex request failed: ${JSON.stringify(message.error)}`));
				else request.resolve(message.result);
			} else if (message.id === undefined && message.method !== undefined) {
				// The native terminal answers app-server requests sent to the thread's subscribers.
				notify(message);
			}
		});
	}
	async initialize() {
		await this.opened;
		await this.request("initialize", {
			clientInfo: { name: "trellis_host", version: "1" },
			capabilities: { experimentalApi: true },
		});
		this.socket.send(JSON.stringify({ method: "initialized" }));
	}
	request(method: string, params: unknown): Promise<unknown> {
		const id = ++this.nextId;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Codex ${method} response is unknown: request timed out`));
				this.socket.terminate();
			}, 15000);
			this.pending.set(id, { resolve, reject, timer });
			this.socket.send(JSON.stringify({ id, method, params }));
		});
	}
	close() {
		this.socket.close();
	}
}

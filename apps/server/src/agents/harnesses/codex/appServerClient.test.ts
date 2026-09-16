import { expect, test } from "bun:test";
import { EventEmitter, once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { CodexAppServerClient } from "./appServerClient.ts";

async function fixture(handleRequest?: ConstructorParameters<typeof CodexAppServerClient>[2]) {
	const home = await mkdtemp("/tmp/trl-codex-client-");
	const path = join(home, "engine.sock");
	const messages = new EventEmitter();
	let socket!: Bun.ServerWebSocket<undefined>;
	const server = Bun.serve({
		unix: path,
		fetch(request, server) {
			server.upgrade(request);
		},
		websocket: {
			open(peer: Bun.ServerWebSocket<undefined>) {
				socket = peer;
			},
			message(_peer, message) {
				messages.emit("message", message);
			},
		},
	});
	const notifications: unknown[] = [];
	const client = new CodexAppServerClient(path, (message) => notifications.push(message), handleRequest);
	void client.closed.catch(() => {});
	await client.opened;
	const peer = Object.assign(messages, { send: (message: string) => socket.send(message) });
	return {
		client,
		peer,
		notifications,
		async close() {
			client.close();
			await server.stop(true);
			await rm(home, { recursive: true, force: true });
		},
	};
}

test("the Codex observer answers a dynamic tool request with its original request ID", async () => {
	const requests: unknown[] = [];
	const result = { success: true, contentItems: [{ type: "inputText", text: "[]" }] };
	const f = await fixture(async (request) => {
		requests.push(request);
		return result;
	});
	try {
		const request = {
			id: "manager-tool-1",
			method: "item/tool/call",
			params: { threadId: "thread", tool: "trellis_projects_list", arguments: {} },
		};
		const received = once(f.peer, "message", { signal: AbortSignal.timeout(1000) });
		f.peer.send(JSON.stringify(request));
		const [response] = await received;
		expect(JSON.parse(response.toString())).toEqual({ id: request.id, result });
		expect(requests).toEqual([request]);
		expect(f.notifications).toEqual([]);
	} finally {
		await f.close();
	}
});

test.each([undefined, async () => undefined])(
	"unhandled server requests remain available to the native terminal",
	async (handler) => {
		const f = await fixture(handler);
		try {
			const received: unknown[] = [];
			f.peer.on("message", (data) => {
				const message = JSON.parse(data.toString());
				received.push(message);
				if (message.method === "fixture/sync") f.peer.send(JSON.stringify({ id: message.id, result: {} }));
			});
			f.peer.send(JSON.stringify({ id: "question", method: "item/tool/requestUserInput", params: {} }));
			await f.client.request("fixture/sync", {});
			expect(received).toEqual([{ id: 1, method: "fixture/sync", params: {} }]);
		} finally {
			await f.close();
		}
	},
);

test("a failed server request handler rejects the observed connection", async () => {
	const f = await fixture(async () => {
		throw new Error("Tool bridge disconnected");
	});
	let timer: ReturnType<typeof setTimeout>;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error("The client did not report the failed request")), 1000);
	});
	try {
		f.peer.send(JSON.stringify({ id: 8, method: "item/tool/call", params: {} }));
		await expect(Promise.race([f.client.closed, deadline])).rejects.toThrow("Tool bridge disconnected");
	} finally {
		clearTimeout(timer!);
		await f.close();
	}
}, 2000);

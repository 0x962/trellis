import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeClient } from "../../client.ts";
import type { RuntimeRequest } from "../../index.ts";

export type ScriptedReply = (request: RuntimeRequest, socket: Socket) => unknown;
export type ScriptedRuntime = {
	socketPath: string;
	client: RuntimeClient;
	// Every request the socket received, in order.
	requests: RuntimeRequest[];
	close(): Promise<void>;
};

// A runtime stand-in on a Unix socket in a temporary directory. `reply`
// answers each request. A reply of undefined leaves the request open, so the
// caller reaches its own deadline with no answer. A reply that throws an
// error with a `code` becomes an error response with that code.
export async function scriptedRuntime(reply: ScriptedReply): Promise<ScriptedRuntime> {
	const home = await mkdtemp(join(tmpdir(), "trellis-scripted-"));
	const path = join(home, "s");
	const requests: RuntimeRequest[] = [];
	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		let buffer = "";
		socket.setEncoding("utf8");
		socket.on("data", async (chunk) => {
			buffer += chunk;
			if (!buffer.includes("\n")) return;
			const request = JSON.parse(buffer) as RuntimeRequest;
			requests.push(request);
			let response: string;
			try {
				const result = await reply(request, socket);
				if (result === undefined) return;
				response = JSON.stringify({ id: request.id, result });
			} catch (error) {
				const { code, message } = error as { code?: string; message: string };
				response = JSON.stringify({ id: request.id, error: { code: code ?? "SCRIPTED_ERROR", message } });
			}
			// The reply arrives in two chunks, so a client that joins chunks
			// before the newline is proven by every test.
			socket.write(response.slice(0, 10));
			setImmediate(() => socket.end(`${response.slice(10)}\n`));
		});
	});
	await new Promise<void>((resolve) => server.listen(path, resolve));
	return {
		socketPath: path,
		client: new RuntimeClient(path),
		requests,
		// The directory goes first, so a socket that keeps the server open
		// cannot leave the directory in the temporary directory.
		close: async () => {
			await rm(home, { recursive: true, force: true });
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}

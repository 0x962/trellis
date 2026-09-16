import { chmod, rm } from "node:fs/promises";
import { createServer } from "node:http";
import WebSocket, { WebSocketServer } from "ws";
import { z } from "zod";

const envelope = z.looseObject({
	id: z.union([z.string(), z.number()]).optional(),
	method: z.string().optional(),
	params: z.unknown().optional(),
});
const maxPayload = 16 * 1024 * 1024;

export async function startManagerTerminalProxy(input: {
	socket: string;
	engineSocket: string;
	threadId: string;
	transformRequest: (message: unknown) => unknown;
}): Promise<{ close: () => Promise<void>; closed: Promise<never> }> {
	const server = createServer();
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(input.socket, () => {
			server.off("error", reject);
			resolve();
		});
	});
	try {
		await chmod(input.socket, 0o600);
	} catch (error) {
		await new Promise<void>((resolve, reject) => server.close((failure) => (failure ? reject(failure) : resolve())));
		await rm(input.socket, { force: true });
		throw error;
	}
	const sockets = new WebSocketServer({ server, perMessageDeflate: false, maxPayload });
	const pairs = new Set<{ terminal: WebSocket; engine: WebSocket }>();
	let closing: Promise<void> | undefined;
	let stopped = false;
	let rejectClosed!: (error: Error) => void;
	const closed = new Promise<never>((_, reject) => {
		rejectClosed = reject;
	});
	const close = () => {
		if (closing) return closing;
		stopped = true;
		closing = (async () => {
			for (const pair of pairs) {
				pair.terminal.terminate();
				pair.engine.terminate();
			}
			await Promise.all([
				new Promise<void>((resolve, reject) => sockets.close((error) => (error ? reject(error) : resolve()))),
				new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
			]);
			await rm(input.socket, { force: true });
		})();
		return closing;
	};
	const fail = (error: Error) => {
		if (stopped) return;
		void close().then(
			() => rejectClosed(error),
			(cleanup) => rejectClosed(new AggregateError([error, cleanup], error.message)),
		);
	};
	server.on("error", fail);
	sockets.on("error", fail);
	sockets.on("connection", (terminal) => {
		const engine = new WebSocket(`ws+unix://${input.engineSocket}:/`, {
			perMessageDeflate: false,
			maxPayload,
			handshakeTimeout: 15000,
		});
		let normalTerminalClose = false;
		const pair = { terminal, engine };
		const pairFailed = (error: Error) => {
			if (!normalTerminalClose) fail(error);
		};
		pairs.add(pair);
		let forward = new Promise<void>((resolve, reject) => {
			engine.once("open", resolve);
			engine.once("error", reject);
			engine.once("close", () => reject(new Error("Codex manager engine closed before connection")));
		});
		void forward.catch(pairFailed);
		terminal.on("error", fail);
		engine.on("error", pairFailed);
		terminal.once("close", (code) => {
			if (code === 1000 || code === 1005) {
				normalTerminalClose = true;
				engine.close(1000);
			} else fail(new Error(`Codex manager terminal closed (${code})`));
		});
		engine.once("close", (code) => {
			pairFailed(new Error(`Codex manager engine closed (${code})`));
			pairs.delete(pair);
		});
		terminal.on("message", (data, binary) => {
			forward = forward.then(async () => {
				if (normalTerminalClose) return;
				if (binary) throw new Error("Codex manager terminal sent a binary JSON message");
				const message = envelope.parse(JSON.parse(data.toString()));
				const createsThread = message.method === "thread/start" || message.method === "thread/fork";
				const wrongThread =
					message.method !== undefined &&
					message.params &&
					typeof message.params === "object" &&
					"threadId" in message.params &&
					message.params.threadId !== input.threadId;
				if (createsThread || wrongThread) {
					await new Promise<void>((resolve, reject) =>
						terminal.send(
							JSON.stringify({
								id: message.id ?? null,
								error: { code: -32600, message: "Codex manager terminal is restricted to its assigned thread" },
							}),
							(error) => (error ? reject(error) : resolve()),
						),
					);
					return;
				}
				const outgoing = message.method === undefined ? message : input.transformRequest(message);
				await new Promise<void>((resolve, reject) =>
					engine.send(JSON.stringify(outgoing), (error) => (error ? reject(error) : resolve())),
				);
			});
			void forward.catch((error) => pairFailed(error instanceof Error ? error : new Error(String(error))));
		});
		engine.on("message", (data, binary) => {
			if (normalTerminalClose) return;
			terminal.send(data, { binary }, (error) => {
				if (error) pairFailed(error);
			});
		});
	});
	return { close, closed };
}

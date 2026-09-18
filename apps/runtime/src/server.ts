import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";
import {
	RUNTIME_PROTOCOL_VERSION,
	type RuntimeHello,
	type RuntimeMethods,
	type RuntimeRequest,
} from "@trellis/runtime-protocol";
import { outputSubscription } from "./outputSubscription.ts";
import { acquireRuntimeLock } from "./runtimeLock.ts";
import { SessionStore } from "./sessionStore.ts";
import { validateSocketPath } from "./socketPath.ts";
import { serveTerminalChannel } from "./terminalChannel";
import { validateRequest } from "./validateRequest.ts";
import { writeSessionList } from "./writeSessionList";

export async function startRuntime(home: string) {
	validateSocketPath(join(home, "runtime.sock"));
	mkdirSync(home, { recursive: true, mode: 0o700 });
	chmodSync(home, 0o700);
	const releaseLock = await acquireRuntimeLock(home);
	const socketPath = join(home, "runtime.sock");
	const hello: RuntimeHello = {
		version: RUNTIME_PROTOCOL_VERSION,
		daemonId: randomUUID(),
		pid: process.pid,
		startedAt: new Date().toISOString(),
		socketPath,
		capabilities: ["terminal-stream", "terminal-channel", "list-pages"],
	};
	let store: SessionStore;
	const sockets = new Set<Socket>();
	let closing = false;
	let closePromise: Promise<void> | undefined;
	async function dispatch(request: RuntimeRequest) {
		if (closing && request.method === "start") throw new Error("Runtime is shutting down");
		switch (request.method) {
			case "shutdown":
				if (
					[...store.list({ status: "running" }), ...store.list({ status: "unknown" })].some(
						(session) => !session.controllable,
					)
				)
					throw new Error("Cannot shut down: a session has an unknown process owner");
				closing = true;
				await store.stopAll();
				if (store.list({ status: "unknown" }).length > 0)
					throw new Error("Cannot shut down: process cleanup is unconfirmed");
				return null;
			case "hello":
				return hello;
			case "inspect":
				return store.inspect((request.params as RuntimeMethods["inspect"]["params"]).id);
			case "hasMessage":
				return store.hasMessage(request.params as RuntimeMethods["hasMessage"]["params"]);
			case "registerNativeDelivery":
				return store.registerNativeDelivery(request.params as RuntimeMethods["registerNativeDelivery"]["params"]);
			case "observe":
				return store.observe(request.params as RuntimeMethods["observe"]["params"]);
			case "turn":
				return store.turn(request.params as RuntimeMethods["turn"]["params"]);
			case "start":
				return store.start(request.params as RuntimeMethods["start"]["params"]);
			case "input": {
				const p = request.params as RuntimeMethods["input"]["params"];
				return store.input(p.id, p.data, p.expected);
			}
			case "deliver": {
				const p = request.params as RuntimeMethods["deliver"]["params"];
				return store.deliver(p.id, p.messageId, p.data, p.expected);
			}
			case "resize": {
				const p = request.params as RuntimeMethods["resize"]["params"];
				return store.resize(p.id, p.cols, p.rows);
			}
			case "stop":
				return store.stop((request.params as RuntimeMethods["stop"]["params"]).id);
			case "output": {
				const p = request.params as RuntimeMethods["output"]["params"];
				return store.output(p.id, p.offset, p.stream);
			}
		}
	}
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
		socket.on("error", () => socket.destroy());
		socket.setTimeout(30_000, () => socket.destroy());
		let buffer = Buffer.alloc(0);
		const request = async (chunk: Buffer) => {
			buffer = Buffer.concat([buffer, chunk]);
			if (buffer.length > 2_000_000) {
				socket.destroy();
				return;
			}
			const end = buffer.indexOf(10);
			if (end < 0) return;
			socket.pause();
			socket.off("data", request);
			let id = "";
			let listResponse = false;
			try {
				const value = JSON.parse(buffer.subarray(0, end).toString());
				id = typeof value?.id === "string" ? value.id : "";
				const request = validateRequest(value);
				if (request.method === "list" || request.method === "listPage") {
					listResponse = true;
					await writeSessionList(
						socket,
						store,
						id,
						request.params as RuntimeMethods["listPage"]["params"],
						request.method === "listPage",
					);
					return;
				}
				if (request.method === "terminal") {
					await serveTerminalChannel(
						store,
						socket,
						request.params as RuntimeMethods["terminal"]["params"],
						buffer.subarray(end + 1),
					);
					return;
				}
				if (request.method === "subscribe") {
					socket.setTimeout(0);
					const controller = new AbortController();
					const abort = () => controller.abort();
					socket.once("close", abort);
					try {
						await outputSubscription(
							store,
							request.params as RuntimeMethods["subscribe"]["params"],
							(result) =>
								new Promise<void>((resolve, reject) => {
									const timer = setTimeout(() => {
										socket.destroy();
										reject(new Error("Terminal subscriber did not accept output within 30 seconds"));
									}, 30_000);
									socket.write(`${JSON.stringify({ id, result })}\n`, (error) => {
										clearTimeout(timer);
										if (error) reject(error);
										else resolve();
									});
								}),
							controller.signal,
						);
						socket.end();
					} finally {
						socket.off("close", abort);
					}
					return;
				}
				const result = await dispatch(request);
				socket.end(`${JSON.stringify({ id, result })}\n`, () => {
					if (request.method === "shutdown") void close();
				});
			} catch (error) {
				if (listResponse) {
					socket.destroy();
					return;
				}
				const failure = error as Error & { code?: string };
				socket.end(
					`${JSON.stringify({ id, error: { code: failure.code ?? "RUNTIME_ERROR", message: failure.message } })}\n`,
				);
			}
		};
		socket.on("data", request);
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, resolve);
	});
	store = new SessionStore(join(home, "sessions"), hello.daemonId);
	chmodSync(socketPath, 0o600);
	writeFileSync(join(home, "manifest.json"), JSON.stringify({ ...hello, releaseId: process.env.TRELLIS_RELEASE_ID }), {
		mode: 0o600,
	});
	function close() {
		closePromise ??= (async () => {
			closing = true;
			await store.stopAll();
			store.closeWatchers();
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
			rmSync(join(home, "manifest.json"), { force: true });
			releaseLock();
		})();
		return closePromise;
	}
	return { hello, close };
}

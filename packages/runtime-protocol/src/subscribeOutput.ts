import { randomUUID } from "node:crypto";
import { Socket } from "node:net";
import {
	RUNTIME_PROTOCOL_VERSION,
	type RuntimeMethods,
	type RuntimeOutputEvent,
	type RuntimeResponse,
} from "./index.ts";

export async function* subscribeOutput(
	socketPath: string,
	params: RuntimeMethods["subscribe"]["params"],
	signal?: AbortSignal,
): AsyncGenerator<RuntimeOutputEvent> {
	signal?.throwIfAborted();
	const socket = new Socket();
	const id = randomUUID();
	const abort = () => socket.destroy(new Error("Terminal subscription aborted"));
	signal?.addEventListener("abort", abort, { once: true });
	socket.setEncoding("utf8");
	socket.once("connect", () =>
		socket.write(`${JSON.stringify({ id, version: RUNTIME_PROTOCOL_VERSION, method: "subscribe", params })}\n`),
	);
	let buffer = "";
	let ended = false;
	try {
		const chunks = socket[Symbol.asyncIterator]();
		const firstChunk = chunks.next();
		socket.connect(socketPath);
		for (let chunk = await firstChunk; !chunk.done; chunk = await chunks.next()) {
			buffer += chunk.value;
			let end = buffer.indexOf("\n");
			while (end >= 0) {
				const reply = JSON.parse(buffer.slice(0, end)) as RuntimeResponse;
				buffer = buffer.slice(end + 1);
				if (reply.id !== id) throw new Error("Runtime subscription identifier mismatch");
				if ("error" in reply) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
				const event = reply.result as RuntimeOutputEvent;
				ended = event.type === "session" && event.session.status !== "running";
				yield event;
				end = buffer.indexOf("\n");
			}
			if (buffer.length > 3_000_000) throw new Error("Runtime subscription frame exceeds the byte limit");
		}
		if (buffer.length > 0 || !ended) throw new Error("Terminal subscription closed before process exit");
	} finally {
		signal?.removeEventListener("abort", abort);
		socket.destroy();
	}
}

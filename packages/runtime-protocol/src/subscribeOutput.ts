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
	let parts: string[] = [];
	let ended = false;
	try {
		const chunks = socket[Symbol.asyncIterator]();
		const firstChunk = chunks.next();
		socket.connect(socketPath);
		for (let chunk = await firstChunk; !chunk.done; chunk = await chunks.next()) {
			let start = 0;
			let end = chunk.value.indexOf("\n");
			while (end >= 0) {
				parts.push(chunk.value.slice(start, end));
				const reply = JSON.parse(parts.join("")) as RuntimeResponse;
				parts = [];
				if (reply.id !== id) throw new Error("Runtime subscription identifier mismatch");
				if ("error" in reply) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
				const event = reply.result as RuntimeOutputEvent;
				ended = event.type === "session" && event.session.status !== "running";
				yield event;
				start = end + 1;
				end = chunk.value.indexOf("\n", start);
			}
			if (start < chunk.value.length) parts.push(chunk.value.slice(start));
		}
		if (parts.length > 0 || !ended) throw new Error("Terminal subscription closed before process exit");
	} finally {
		signal?.removeEventListener("abort", abort);
		socket.destroy();
	}
}

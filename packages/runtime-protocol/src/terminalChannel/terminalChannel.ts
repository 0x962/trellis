import { randomUUID } from "node:crypto";
import { Socket } from "node:net";
import { RUNTIME_PROTOCOL_VERSION, type RuntimeTerminalEvent } from "../index.ts";
import { encodeTerminalFrame, type TerminalFrame, TerminalFrameDecoder } from "../terminalWire";

export function terminalChannel(socketPath: string, id: string, offset: number, signal?: AbortSignal) {
	const socket = new Socket();
	let attached = false;
	const abort = () => socket.destroy(new Error("Terminal channel aborted"));
	const send = (frame: TerminalFrame) => {
		if (!attached || socket.destroyed) throw new Error("The terminal channel is not connected");
		const bytes = encodeTerminalFrame(frame);
		if (socket.writableLength + bytes.length > 1024 * 1024 + 64) throw new Error("The terminal input buffer is full");
		socket.write(bytes);
	};
	async function* events(): AsyncGenerator<RuntimeTerminalEvent> {
		signal?.throwIfAborted();
		signal?.addEventListener("abort", abort, { once: true });
		const decoder = new TerminalFrameDecoder();
		let ended = false;
		socket.once("connect", () => {
			socket.write(
				`${JSON.stringify({ id: randomUUID(), version: RUNTIME_PROTOCOL_VERSION, method: "terminal", params: { id, offset } })}\n`,
			);
		});
		try {
			const chunks = socket[Symbol.asyncIterator]();
			const firstChunk = chunks.next();
			socket.connect(socketPath);
			for (let chunk = await firstChunk; !chunk.done; chunk = await chunks.next()) {
				for (const frame of decoder.push(chunk.value as Buffer)) {
					if (frame.type === "error") throw new Error(frame.message);
					if (frame.type !== "session" && frame.type !== "output") throw new Error("Unexpected terminal server frame");
					if (frame.type === "session") attached = frame.session.controllable && frame.session.status === "running";
					ended = frame.type === "session" && frame.session.status !== "running";
					yield frame;
				}
			}
			if (decoder.incomplete || !ended) throw new Error("Terminal channel closed before process exit");
		} finally {
			attached = false;
			signal?.removeEventListener("abort", abort);
			socket.destroy();
		}
	}
	return {
		events: events(),
		input: (data: Uint8Array, userInput: boolean) => send({ type: "input", data, userInput }),
		resize: (cols: number, rows: number) => send({ type: "resize", cols, rows }),
		close: () => socket.destroy(),
	};
}

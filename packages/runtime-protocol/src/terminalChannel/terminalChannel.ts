import { randomUUID } from "node:crypto";
import { Socket } from "node:net";
import { RUNTIME_PROTOCOL_VERSION, type RuntimeTerminalEvent } from "../index.ts";
import { encodeTerminalFrame, type TerminalFrame, TerminalFrameDecoder } from "../terminalWire";

const INPUT_CHUNK_BYTES = 64 * 1024;

export function terminalChannel(socketPath: string, id: string, offset: number, signal?: AbortSignal) {
	const socket = new Socket();
	let attached = false;
	let acknowledgement: PromiseWithResolvers<void> | undefined;
	let commands = Promise.resolve();
	const abort = () => {
		acknowledgement?.reject(new Error("Terminal channel aborted"));
		acknowledgement = undefined;
		socket.destroy(new Error("Terminal channel aborted"));
	};
	const write = (bytes: Buffer) =>
		new Promise<void>((resolve, reject) => {
			socket.write(bytes, (error) => {
				if (error) reject(error);
				else resolve();
			});
		});
	const send = (frames: TerminalFrame[]) => {
		const next = commands.then(async () => {
			if (!attached || socket.destroyed) throw new Error("The terminal channel is not connected");
			for (const frame of frames) {
				acknowledgement = Promise.withResolvers<void>();
				await write(encodeTerminalFrame(frame));
				await acknowledgement.promise;
				acknowledgement = undefined;
			}
		});
		commands = next;
		return next;
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
					if (frame.type === "ack") {
						if (!acknowledgement) throw new Error("Unexpected terminal acknowledgement");
						acknowledgement.resolve();
						continue;
					}
					if (frame.type !== "session" && frame.type !== "output") throw new Error("Unexpected terminal server frame");
					if (frame.type === "session") attached = frame.session.controllable && frame.session.status === "running";
					ended = frame.type === "session" && frame.session.status !== "running";
					yield frame;
				}
			}
			if (decoder.incomplete || !ended) throw new Error("Terminal channel closed before process exit");
		} finally {
			attached = false;
			acknowledgement?.reject(new Error("Terminal channel closed before command acknowledgement"));
			acknowledgement = undefined;
			signal?.removeEventListener("abort", abort);
			socket.destroy();
		}
	}
	return {
		events: events(),
		input: (data: Uint8Array, userInput: boolean) => {
			const frames: TerminalFrame[] = [];
			for (let start = 0; start < data.byteLength; start += INPUT_CHUNK_BYTES)
				frames.push({ type: "input", data: data.subarray(start, start + INPUT_CHUNK_BYTES), userInput });
			if (frames.length === 0) frames.push({ type: "input", data, userInput });
			return send(frames);
		},
		resize: (cols: number, rows: number) => send([{ type: "resize", cols, rows }]),
		close: () => socket.destroy(),
	};
}

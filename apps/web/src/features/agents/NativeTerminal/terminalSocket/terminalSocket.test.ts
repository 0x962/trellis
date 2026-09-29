import { expect, test } from "bun:test";
import { createTerminalSocket } from "./terminalSocket";

class FakeSocket {
	readonly sent: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];
	readonly listeners = new Map<string, Set<(event: Event | MessageEvent) => void>>();
	readonly readyState = WebSocket.OPEN;
	readonly bufferedAmount = 0;
	binaryType = "arraybuffer";
	addEventListener(type: string, listener: (event: Event | MessageEvent) => void) {
		const listeners = this.listeners.get(type) ?? new Set();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}
	removeEventListener(type: string, listener: (event: Event | MessageEvent) => void) {
		this.listeners.get(type)?.delete(listener);
	}
	close() {}
	send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
		this.sent.push(data);
		if (typeof data !== "string")
			queueMicrotask(() =>
				this.emit("message", new MessageEvent("message", { data: JSON.stringify({ type: "input-ack" }) })),
			);
	}
	emit(type: string, event: Event | MessageEvent) {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}
}

test("sends complete ordered multibyte input above one MiB as acknowledged pieces", async () => {
	const socket = new FakeSocket();
	const signal = new AbortController();
	const transport = createTerminalSocket({
		run: { id: "run", terminalId: "attempt", sessionId: "session" },
		offset: 0,
		signal: signal.signal,
		onOutput: async () => {},
		onSession: () => {},
		origin: "http://127.0.0.1:4521",
		createSocket: () => socket as unknown as WebSocket,
	});
	const input = `first-${"文🙂".repeat(150_000)}-last`;

	await transport.send(input, true);
	signal.abort();

	const frames = socket.sent.filter(
		(value): value is ArrayBufferView => typeof value !== "string" && !(value instanceof Blob),
	);
	expect(frames.length).toBeGreaterThan(1);
	const bytes = Buffer.concat(
		frames.map((frame) => {
			const value = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
			expect(value[0]).toBe(1);
			return value.subarray(1);
		}),
	);
	expect(bytes.toString()).toBe(input);
});

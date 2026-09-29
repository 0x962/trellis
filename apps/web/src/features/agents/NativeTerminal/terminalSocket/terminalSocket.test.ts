import { expect, test } from "bun:test";
import { createTerminalSocket } from "./terminalSocket";

class FakeSocket {
	readonly sent: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];
	readonly listeners = new Map<string, Set<(event: Event | MessageEvent) => void>>();
	readonly readyState = WebSocket.OPEN;
	readonly bufferedAmount = 0;
	binaryType = "arraybuffer";
	constructor(private readonly acknowledgeInput = true) {}
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
		if (this.acknowledgeInput && typeof data !== "string")
			queueMicrotask(() =>
				this.emit("message", new MessageEvent("message", { data: JSON.stringify({ type: "input-ack" }) })),
			);
	}
	emit(type: string, event: Event | MessageEvent) {
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}
}

const outputFrame = (startOffset: number, data: Uint8Array) => {
	const frame = new Uint8Array(17 + data.byteLength);
	const header = new DataView(frame.buffer);
	header.setFloat64(0, startOffset);
	header.setFloat64(8, startOffset + data.byteLength);
	header.setUint8(16, 0);
	frame.set(data, 17);
	return frame.buffer;
};

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

test("acknowledges output while acknowledged input pieces wait", async () => {
	const socket = new FakeSocket(false);
	const signal = new AbortController();
	const output: Uint8Array[] = [];
	const transport = createTerminalSocket({
		run: { id: "run", terminalId: "attempt", sessionId: "session" },
		offset: 0,
		signal: signal.signal,
		onOutput: async (frame) => {
			if (typeof frame.data === "string") throw new Error("Expected binary terminal output.");
			output.push(frame.data);
		},
		onSession: () => {},
		origin: "http://127.0.0.1:4521",
		createSocket: () => socket as unknown as WebSocket,
	});
	const input = `first-${"文🙂".repeat(10_000)}-last`;
	const sending = transport.send(input, true);
	await Promise.resolve();

	const rendered = new Uint8Array(256 * 1024).fill(7);
	socket.emit("message", new MessageEvent("message", { data: outputFrame(0, rendered) }));
	await Promise.resolve();
	await Promise.resolve();

	const inputFrames = () =>
		socket.sent.filter((value): value is ArrayBufferView => typeof value !== "string" && !(value instanceof Blob));
	const acknowledgements = socket.sent
		.filter((value): value is string => typeof value === "string")
		.map((value) => JSON.parse(value));
	expect(inputFrames()).toHaveLength(1);
	expect(acknowledgements).toContainEqual({ type: "ack", offset: rendered.byteLength });
	expect(Buffer.concat(output.map((value) => Buffer.from(value)))).toEqual(Buffer.from(rendered));

	socket.emit("message", new MessageEvent("message", { data: JSON.stringify({ type: "input-ack" }) }));
	await Promise.resolve();
	await Promise.resolve();
	expect(inputFrames()).toHaveLength(2);
	socket.emit("message", new MessageEvent("message", { data: JSON.stringify({ type: "input-ack" }) }));
	await sending;
	signal.abort();

	const inputBytes = Buffer.concat(
		inputFrames().map((frame) => Buffer.from(frame.buffer, frame.byteOffset + 1, frame.byteLength - 1)),
	);
	expect(inputBytes.toString()).toBe(input);
});

test("ignores events from a detached attempt and preserves a replacement connection error", async () => {
	const oldSocket = new FakeSocket();
	const newSocket = new FakeSocket();
	const oldController = new AbortController();
	const newController = new AbortController();
	const observed: string[] = [];
	const connect = (terminalId: string, socket: FakeSocket, controller: AbortController) =>
		createTerminalSocket({
			run: { id: "run", terminalId, sessionId: "conversation" },
			offset: 0,
			signal: controller.signal,
			onOutput: async () => {},
			onSession: (session) => observed.push(`${terminalId}:${session.status}`),
			origin: "http://127.0.0.1:4521",
			createSocket: (url) => {
				expect(new URL(url).searchParams.get("attemptId")).toBe(terminalId);
				return socket as unknown as WebSocket;
			},
		});
	const old = connect("old-attempt", oldSocket, oldController);
	oldController.abort();
	await old.done;
	const replacement = connect("new-attempt", newSocket, newController);
	oldSocket.emit(
		"message",
		new MessageEvent("message", { data: JSON.stringify({ type: "session", session: { status: "exited" } }) }),
	);
	oldSocket.emit("error", new Event("error"));
	oldSocket.emit("close", new Event("close"));
	newSocket.emit(
		"message",
		new MessageEvent("message", { data: JSON.stringify({ type: "session", session: { status: "running" } }) }),
	);
	expect(observed).toEqual(["new-attempt:running"]);
	const failure = expect(replacement.done).rejects.toThrow("The terminal connection failed.");
	newSocket.emit("error", new Event("error"));
	await failure;
	newController.abort();
});

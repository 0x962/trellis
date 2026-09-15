import { expect, test } from "bun:test";
import { createTerminalSocket } from "./terminalSocket";

class Socket extends EventTarget {
	binaryType = "blob";
	readyState = 1;
	bufferedAmount = 0;
	sent: string[] = [];
	closed = false;
	send(data: string) {
		this.sent.push(data);
	}
	close() {
		this.closed = true;
		this.readyState = 3;
	}
	message(data: string | ArrayBuffer) {
		this.dispatchEvent(new MessageEvent("message", { data }));
	}
}

const output = (text: string, offset: number) => {
	const bytes = new TextEncoder().encode(text);
	const data = new ArrayBuffer(17 + bytes.length);
	const header = new DataView(data);
	header.setFloat64(0, offset);
	header.setFloat64(8, offset + bytes.length);
	new Uint8Array(data, 17).set(bytes);
	return data;
};

const setup = (onOutput = async (_frame: unknown) => {}) => {
	const socket = new Socket();
	const controller = new AbortController();
	let url = "";
	const transport = createTerminalSocket({
		run: { id: "run", terminalId: "attempt", sessionId: "provider" },
		offset: 23,
		signal: controller.signal,
		onOutput,
		onSession: () => {},
		origin: "https://trellis.local",
		createSocket: (address) => {
			url = address;
			return socket as unknown as WebSocket;
		},
	});
	return { socket, controller, transport, url };
};

test("terminal input sends in order without server acknowledgements", async () => {
	const { socket, transport, controller, url } = setup();
	expect(url).toBe(
		"wss://trellis.local/api/agent-runs/run/terminal/socket?attemptId=attempt&offset=23&sessionId=provider",
	);
	expect(socket.binaryType).toBe("arraybuffer");
	await transport.send("a", true);
	await transport.send("b", false);
	await transport.resize(100, 32);
	expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
		{ type: "input", data: "a", userInput: true },
		{ type: "input", data: "b", userInput: false },
		{ type: "resize", cols: 100, rows: 32 },
	]);
	controller.abort();
	await transport.done;
	expect(socket.closed).toBe(true);
});

test("binary output reaches the renderer without a wait and drains on process exit", async () => {
	const frames: unknown[] = [];
	const writes = Promise.withResolvers<void>();
	const { socket, transport } = setup(async (frame) => {
		frames.push(frame);
		await writes.promise;
	});
	socket.message(output("a", 23));
	socket.message(output("b", 24));
	expect(frames).toEqual([
		{ data: Uint8Array.of(97), startOffset: 23, nextOffset: 24, truncated: false },
		{ data: Uint8Array.of(98), startOffset: 24, nextOffset: 25, truncated: false },
	]);
	socket.message('{"type":"session","session":{"status":"exited"}}');
	socket.dispatchEvent(new Event("close"));
	let done = false;
	void transport.done.then(() => {
		done = true;
	});
	await Promise.resolve();
	expect(done).toBe(false);
	writes.resolve();
	await transport.done;
});

test("abort detaches the socket and never replays input", async () => {
	let frames = 0;
	const { socket, transport, controller } = setup(async () => {
		frames++;
	});
	controller.abort();
	await transport.done;
	socket.message(output("a", 0));
	expect(frames).toBe(0);
	await expect(transport.send("x", true)).rejects.toThrow("not connected");
	expect(socket.sent).toEqual([]);
});

test("a blocked browser send buffer closes the connection", async () => {
	const { socket, transport } = setup();
	socket.bufferedAmount = 1024 * 1024;
	const result = transport.done.catch((error: Error) => error);
	await expect(transport.send("x", true)).rejects.toThrow("buffer");
	expect(((await result) as Error).message).toContain("buffer");
	expect(socket.closed).toBe(true);
});

test("server errors, parse failures, and unexpected disconnects reach the terminal", async () => {
	for (const data of ['{"type":"error","message":"The attempt changed."}', "{", output("", 0).slice(0, 4)]) {
		const { socket, transport } = setup();
		const result = transport.done.catch((error: Error) => error);
		socket.message(data);
		expect(await result).toBeInstanceOf(Error);
		expect(socket.closed).toBe(true);
	}
	const { socket, transport } = setup();
	const result = transport.done.catch((error: Error) => error);
	socket.dispatchEvent(new Event("close"));
	expect(await result).toBeInstanceOf(Error);
});

test("renderer write failures close the connection", async () => {
	const { socket, transport } = setup(async () => {
		throw new Error("Renderer failed");
	});
	const result = transport.done.catch((error: Error) => error);
	socket.message(output("x", 0));
	expect(await result).toBeInstanceOf(Error);
	expect(socket.closed).toBe(true);
});

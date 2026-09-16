import { expect, test } from "bun:test";
import type { RuntimeOutputEvent, RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { WSContext } from "hono/ws";
import { terminalConnection } from "./terminalConnection";

const session: RuntimeProcessStatus = {
	id: "attempt",
	daemonId: "runtime",
	pid: 1,
	mode: "pty",
	status: "running",
	startedAt: "2026-09-15T00:00:00.000Z",
	endedAt: null,
	exitCode: null,
	error: null,
	elapsedMs: 0,
	agent: null,
	result: null,
	acknowledgedMessageIds: [],
	activity: null,
	checkedAt: "2026-09-15T00:00:00.000Z",
	controllable: true,
	process: null,
	launch: null,
};
const flush = async () => {
	for (let index = 0; index < 12; index++) await Promise.resolve();
};

const setup = async (write: () => Promise<null> = async () => null) => {
	const calls: unknown[][] = [];
	const sent: (string | ArrayBuffer | Uint8Array)[] = [];
	const closes: [number | undefined, string | undefined][] = [];
	const events: RuntimeOutputEvent[] = [{ type: "session", session }];
	let wake = () => {};
	let bufferedAmount = 0;
	let subscription: { id: string; offset: number; signal: AbortSignal | undefined } | undefined;
	const client: Pick<RuntimeClient, "subscribe" | "input" | "resize"> = {
		async *subscribe(id, offset = 0, signal) {
			subscription = { id, offset, signal };
			while (!signal?.aborted) {
				const next = events.shift();
				if (next) yield next;
				else
					await new Promise<void>((resolve) => {
						wake = resolve;
						signal?.addEventListener("abort", () => resolve(), { once: true });
					});
			}
		},
		async input(id, data, userInput) {
			calls.push(["input", id, Buffer.from(data, "base64").toString(), userInput]);
			return write();
		},
		async resize(id, cols, rows) {
			calls.push(["resize", id, cols, rows]);
			return null;
		},
	};
	const ws = new WSContext({
		readyState: 1,
		raw: { getBufferedAmount: () => bufferedAmount },
		send: (data) => {
			sent.push(data);
		},
		close: (code, reason) => {
			closes.push([code, reason]);
		},
	});
	const handlers = terminalConnection(client, "attempt", 25);
	handlers.onOpen!(new Event("open"), ws);
	await flush();
	return {
		calls,
		sent,
		closes,
		subscription: () => subscription!,
		buffer: (bytes: number) => {
			bufferedAmount = bytes;
		},
		output: (event: RuntimeOutputEvent) => {
			events.push(event);
			wake();
		},
		raw: (data: string | ArrayBuffer) => handlers.onMessage!(new MessageEvent("message", { data }), ws),
		command: (command: object) =>
			handlers.onMessage!(new MessageEvent("message", { data: JSON.stringify(command) }), ws),
		close: () => handlers.onClose!(new CloseEvent("close"), ws),
	};
};

test("terminal input and resize preserve order while a runtime write waits", async () => {
	const pending = Promise.withResolvers<null>();
	const connection = await setup(() => pending.promise);
	expect(connection.subscription().id).toBe("attempt");
	expect(connection.subscription().offset).toBe(25);
	connection.command({ type: "input", data: "a", userInput: true });
	connection.command({ type: "resize", cols: 80, rows: 24 });
	connection.command({ type: "input", data: "b", userInput: false });
	expect(connection.calls).toEqual([["input", "attempt", "a", true]]);
	pending.resolve(null);
	await flush();
	expect(connection.calls).toEqual([
		["input", "attempt", "a", true],
		["resize", "attempt", 80, 24],
		["input", "attempt", "b", false],
	]);
	connection.close();
});

test("socket close discards queued input and aborts output", async () => {
	const pending = Promise.withResolvers<null>();
	const connection = await setup(() => pending.promise);
	connection.command({ type: "input", data: "a", userInput: true });
	connection.command({ type: "input", data: "b", userInput: true });
	connection.close();
	connection.command({ type: "input", data: "c", userInput: true });
	pending.resolve(null);
	await flush();
	expect(connection.calls).toEqual([["input", "attempt", "a", true]]);
	expect(connection.subscription().signal?.aborted).toBe(true);
});

test("failed runtime input closes the socket without a replay", async () => {
	const pending = Promise.withResolvers<null>();
	const connection = await setup(() => pending.promise);
	connection.command({ type: "input", data: "a", userInput: true });
	connection.command({ type: "input", data: "b", userInput: true });
	pending.reject(new Error("Write result is unknown"));
	await flush();
	connection.command({ type: "input", data: "c", userInput: true });
	expect(connection.calls).toEqual([["input", "attempt", "a", true]]);
	expect(connection.sent).toContain(JSON.stringify({ type: "error", message: "Write result is unknown" }));
	expect(connection.closes[0]?.[0]).toBe(1011);
	expect(connection.subscription().signal?.aborted).toBe(true);
});

test("output above the 8 MiB socket backlog closes without a further frame", async () => {
	const connection = await setup();
	connection.buffer(8 * 1024 * 1024 + 1);
	connection.output({ type: "output", data: "YQ==", startOffset: 25, nextOffset: 26, truncated: false });
	await flush();
	expect(connection.sent).toHaveLength(1);
	expect(connection.closes[0]?.[0]).toBe(1013);
	expect(connection.subscription().signal?.aborted).toBe(true);
});

test("invalid commands close the socket before runtime input", async () => {
	for (const data of ["{", '{"type":"resize","cols":0,"rows":24}', '{"type":"input","data":"a"}', new ArrayBuffer(2)]) {
		const connection = await setup();
		connection.raw(data);
		await flush();
		expect(connection.calls).toEqual([]);
		expect(connection.closes[0]?.[0]).toBe(1011);
		expect(connection.subscription().signal?.aborted).toBe(true);
	}
});

test("binary output preserves byte offsets and the retained-buffer gap flag", async () => {
	const connection = await setup();
	connection.output({
		type: "output",
		data: Buffer.from("é").toString("base64"),
		startOffset: 30,
		nextOffset: 32,
		truncated: true,
	});
	await flush();
	const frame = connection.sent[1] as Uint8Array;
	const header = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
	expect(header.getFloat64(0)).toBe(30);
	expect(header.getFloat64(8)).toBe(32);
	expect(header.getUint8(16)).toBe(1);
	expect(Buffer.from(frame.subarray(17)).toString()).toBe("é");
	connection.close();
});

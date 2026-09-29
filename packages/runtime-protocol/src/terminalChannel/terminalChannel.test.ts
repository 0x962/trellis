import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeProcessStatus } from "../index";
import { encodeTerminalFrame, TerminalFrameDecoder } from "../terminalWire";
import { terminalChannel } from "./terminalChannel";

let directory = "";
let server: Server | undefined;

afterEach(async () => {
	if (server)
		await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
	server = undefined;
	if (directory) await rm(directory, { recursive: true, force: true });
	directory = "";
});

test("carries complete ordered input above one MiB through acknowledged pieces", async () => {
	directory = await mkdtemp(join(tmpdir(), "trellis-terminal-channel-"));
	const socketPath = join(directory, "runtime.sock");
	const expected = Buffer.concat([Buffer.alloc(1024 * 1024 + 5, 120), Buffer.from("文🙂")]);
	const received: Buffer[] = [];
	const sizes: number[] = [];
	server = createServer((socket) => {
		let request = Buffer.alloc(0);
		let attached = false;
		const decoder = new TerminalFrameDecoder();
		const receive = (chunk: Buffer) => {
			for (const frame of decoder.push(chunk)) {
				if (frame.type !== "input") throw new Error("Expected terminal input");
				received.push(Buffer.from(frame.data));
				sizes.push(frame.data.byteLength);
				const length = received.reduce((total, value) => total + value.byteLength, 0);
				if (length === expected.byteLength)
					socket.end(
						Buffer.concat([
							encodeTerminalFrame({ type: "ack" }),
							encodeTerminalFrame({
								type: "session",
								session: { status: "exited", controllable: false } as RuntimeProcessStatus,
							}),
						]),
					);
				else socket.write(encodeTerminalFrame({ type: "ack" }));
			}
		};
		socket.on("data", (chunk) => {
			if (attached) {
				receive(chunk);
				return;
			}
			request = Buffer.concat([request, chunk]);
			const end = request.indexOf(10);
			if (end < 0) return;
			attached = true;
			socket.write(
				encodeTerminalFrame({
					type: "session",
					session: { status: "running", controllable: true } as RuntimeProcessStatus,
				}),
			);
			if (end + 1 < request.length) receive(request.subarray(end + 1));
		});
	});
	await new Promise<void>((resolve, reject) => {
		server!.once("error", reject);
		server!.listen(socketPath, resolve);
	});

	const channel = terminalChannel(socketPath, "attempt", 0);
	const attached = Promise.withResolvers<void>();
	const events = (async () => {
		for await (const event of channel.events)
			if (event.type === "session" && event.session.status === "running") attached.resolve();
	})();
	await attached.promise;
	await channel.input(expected, true);
	await events;

	expect(Buffer.concat(received)).toEqual(expected);
	expect(Math.max(...sizes)).toBeLessThanOrEqual(64 * 1024);
});

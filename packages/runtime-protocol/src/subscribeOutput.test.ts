import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { subscribeOutput } from "./subscribeOutput";

let directory = "";
let server: Server | undefined;

afterEach(async () => {
	if (server)
		await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
	server = undefined;
	if (directory) await rm(directory, { recursive: true, force: true });
	directory = "";
});

test("reads a complete multibyte subscription event above the former byte limit", async () => {
	directory = await mkdtemp(join(tmpdir(), "trellis-runtime-subscription-"));
	const socketPath = join(directory, "runtime.sock");
	const data = "文".repeat(1_100_000);
	server = createServer((socket) => {
		let request = "";
		socket.setEncoding("utf8");
		socket.on("data", (chunk) => {
			request += chunk;
			if (!request.includes("\n")) return;
			const id = (JSON.parse(request.slice(0, request.indexOf("\n"))) as { id: string }).id;
			const output = Buffer.from(
				`${JSON.stringify({ id, result: { type: "output", data, startOffset: 0, nextOffset: Buffer.byteLength(data), truncated: false } })}\n`,
			);
			const session = Buffer.from(
				`${JSON.stringify({ id, result: { type: "session", session: { status: "exited" } } })}\n`,
			);
			socket.write(output.subarray(0, 1_000_001));
			socket.write(output.subarray(1_000_001, 2_000_003));
			socket.end(Buffer.concat([output.subarray(2_000_003), session]));
		});
	});
	await new Promise<void>((resolve, reject) => {
		server!.once("error", reject);
		server!.listen(socketPath, resolve);
	});

	const events = [];
	for await (const event of subscribeOutput(socketPath, { id: "attempt", offset: 0 })) events.push(event);

	expect(events).toHaveLength(2);
	expect(events[0]).toMatchObject({ type: "output", data });
	expect(events[1]).toMatchObject({ type: "session", session: { status: "exited" } });
});

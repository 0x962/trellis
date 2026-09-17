import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { RuntimeClient } from "../../../src/client.ts";

for (const method of ["hello", "subscribe"] as const) {
	test(`an absent runtime rejects ${method} from an HTTP request without an uncaught socket error`, async () => {
		const directory = await mkdtemp("/tmp/trl-connect-");
		try {
			const script = `
				import { RuntimeClient } from ${JSON.stringify(new URL("../../../src/client.ts", import.meta.url).pathname)};
				const client = new RuntimeClient(${JSON.stringify(join(directory, "absent.sock"))});
				const server = Bun.serve({port:0, fetch:async () => {
					try { await ${method === "hello" ? "client.hello()" : 'client.subscribe("attempt").next()'}; }
					catch(error) { return Response.json({ code: error.code }); }
					throw new Error("The connection unexpectedly succeeded");
				}});
				const result = await (await fetch(server.url)).json();
				server.stop(true);
				if (result.code !== "ENOENT") throw new Error(JSON.stringify(result));
			`;
			const process = Bun.spawn([Bun.which("bun")!, "--eval", script], { stdout: "pipe", stderr: "pipe" });
			const [code, stderr] = await Promise.all([process.exited, new Response(process.stderr).text()]);
			expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
}

test("a large runtime response avoids repeated copies of prior chunks", async () => {
	const directory = await mkdtemp(join(process.env.TRELLIS_TEST_ROOT!, "runtime-client-"));
	const socketPath = join(directory, "runtime.sock");
	const server = createServer((socket) => {
		let request = "";
		socket.setEncoding("utf8");
		socket.on("data", (chunk) => {
			request += chunk;
			const end = request.indexOf("\n");
			if (end < 0) return;
			socket.removeAllListeners("data");
			const id = JSON.parse(request.slice(0, end)).id;
			const response = `${JSON.stringify({ id, result: ["x".repeat(10_000_000)] })}\n`;
			let offset = 0;
			const writeChunk = () => {
				if (offset === response.length) {
					socket.end();
					return;
				}
				socket.write(response.slice(offset, offset + 1024));
				offset = Math.min(offset + 1024, response.length);
				setImmediate(writeChunk);
			};
			writeChunk();
		});
	});
	await new Promise<void>((resolve) => server.listen(socketPath, resolve));
	try {
		const startedAt = performance.now();
		const result = (await new RuntimeClient(socketPath, 4000).call("list", {})) as unknown as string[];
		expect(result[0]?.length).toBe(10_000_000);
		expect(performance.now() - startedAt).toBeLessThan(750);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await rm(directory, { recursive: true, force: true });
	}
});

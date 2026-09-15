import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

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

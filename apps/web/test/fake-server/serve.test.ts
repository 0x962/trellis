import { describe, expect, test } from "bun:test";
import { connect } from "node:net";
import { join } from "node:path";

const web = join(import.meta.dir, "..", "..");

// Resolves true when something accepts a TCP connection on the port.
const portOpen = (port: number) =>
	new Promise<boolean>((resolve) => {
		const socket = connect({ host: "127.0.0.1", port });
		socket.once("connect", () => {
			socket.end();
			resolve(true);
		});
		socket.once("error", () => resolve(false));
	});

const waitForPort = async (port: number) => {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (await portOpen(port)) return;
		await Bun.sleep(100);
	}
	throw new Error(`nothing listens on ${port} after 5 s`);
};

describe("bun run dev:fake", () => {
	// WS-140. Playwright and `bun run dev` with TRELLIS_API_URL point at
	// this port.
	test("dev:fake serves the fake app on 4522", async () => {
		const child = Bun.spawn(["bun", "run", "dev:fake"], { cwd: web, stdout: "pipe", stderr: "pipe" });
		try {
			await waitForPort(4522);
			const response = await fetch("http://127.0.0.1:4522/api/health");
			expect(response.status).toBe(200);
			expect(((await response.json()) as { ok: boolean }).ok).toBe(true);
		} finally {
			child.kill();
			await child.exited;
		}
	});
});

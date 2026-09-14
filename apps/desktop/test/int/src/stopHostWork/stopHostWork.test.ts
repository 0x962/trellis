import { expect, test } from "bun:test";
import { stopHostWork } from "../../../../src/stopHostWork/stopHostWork.ts";

test("an uncertain local stop leaves the background service registered", async () => {
	let disabled = false;
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: () => new Response("A process has unknown ownership.", { status: 409 }),
	});
	try {
		await expect(
			stopHostWork({ origin: server.url.origin, token: "test-token", pid: 1 }, async () => {
				disabled = true;
			}),
		).rejects.toThrow("unknown ownership");
		expect(disabled).toBe(false);
	} finally {
		server.stop(true);
	}
});

test("the service stops only after the host confirms the local processes stopped", async () => {
	let confirmed = false;
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: (request) => {
			expect(request.headers.get("Authorization")).toBe("Bearer test-token");
			expect(request.headers.get("x-trellis-actor")).toBe("human:desktop");
			confirmed = true;
			return Response.json({ stopped: 2 });
		},
	});
	try {
		await stopHostWork({ origin: server.url.origin, token: "test-token", pid: 1 }, async () => {
			expect(confirmed).toBe(true);
		});
	} finally {
		server.stop(true);
	}
});

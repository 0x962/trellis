import { afterEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import type { Server } from "node:http";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexAppServerClient } from "./appServerClient";
import { codexControl } from "./codexControl";

const sockets = new Set<string>();
const servers = new Set<Server>();

afterEach(async () => {
	for (const server of servers)
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	servers.clear();
	for (const socket of sockets) await rm(socket, { force: true });
	sockets.clear();
});

const post = (socketPath: string, body: Buffer) =>
	new Promise<{ status: number; body: string }>((resolve, reject) => {
		const call = request(
			{
				socketPath,
				path: "/prompt",
				method: "POST",
				headers: { authorization: "Bearer token", "content-length": String(body.byteLength) },
			},
			(response) => {
				response.setEncoding("utf8");
				let text = "";
				response.on("data", (chunk) => (text += chunk));
				response.on("end", () => resolve({ status: response.statusCode!, body: text }));
			},
		);
		call.once("error", reject);
		const firstCharacter = body.indexOf(Buffer.from("文"));
		const split = firstCharacter + 3 * 400_000 + 1;
		call.write(body.subarray(0, split));
		call.end(body.subarray(split));
	});

test("accepts a complete multibyte control payload above one MiB", async () => {
	const socket = join(tmpdir(), `trellis-codex-control-${process.pid}.sock`);
	sockets.add(socket);
	const prompt = "文".repeat(500_000);
	let received = "";
	const server = await codexControl({
		socket,
		token: "token",
		sessionId: "session",
		client: {
			request: async (_method: string, params: { input: Array<{ text: string }> }) => {
				received = params.input[0]!.text;
			},
		} as unknown as CodexAppServerClient,
		current: () => ({ turnId: null, working: false }),
	});
	servers.add(server);

	const response = await post(socket, Buffer.from(JSON.stringify({ sessionId: "session", prompt })));

	expect(response).toMatchObject({ status: 200 });
	expect(received).toBe(prompt);
});

import { afterEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCodeControl } from "./control.mjs";

let control;
let socket;

afterEach(async () => {
	if (control) await control.close();
	control = undefined;
	if (socket) await rm(socket, { force: true });
	socket = undefined;
});

const post = (socketPath, body) =>
	new Promise((resolve, reject) => {
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
				response.on("end", () => resolve({ status: response.statusCode, body: text }));
			},
		);
		call.once("error", reject);
		const firstCharacter = body.indexOf(Buffer.from("文"));
		const split = firstCharacter + 3 * 400_000 + 1;
		call.write(body.subarray(0, split));
		call.end(body.subarray(split));
	});

test("OpenCode accepts a complete multibyte control payload above one MiB", async () => {
	socket = join(tmpdir(), `trellis-opencode-control-${process.pid}.sock`);
	const prompt = "文".repeat(500_000);
	let received = "";
	control = await openCodeControl({
		socket,
		token: "token",
		current: () => ({ sessionId: "session", turnId: undefined, working: false }),
		abort: () => Promise.resolve({ data: true }),
		prompt: async (_sessionId, value) => {
			received = value;
			return { error: undefined, response: { status: 204 } };
		},
	});

	const response = await post(socket, Buffer.from(JSON.stringify({ sessionId: "session", prompt })));

	expect(response).toMatchObject({ status: 200 });
	expect(received).toBe(prompt);
});

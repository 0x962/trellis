import { expect, test } from "bun:test";
import { MAX_TERMINAL_DIMENSION, RUNTIME_PROTOCOL_VERSION } from "@trellis/runtime-protocol";
import { validateRequest } from "./validateRequest";

const request = (params: unknown) => ({
	id: "request",
	version: RUNTIME_PROTOCOL_VERSION,
	method: "listPage",
	params,
});

test("listPage accepts an opaque cursor and existing list filters", () => {
	const value = request({ ids: ["attempt-1"], status: "running", cursor: "i:daemon:1" });
	expect(validateRequest(value) === value).toBe(true);
	expect(validateRequest(request({ ids: [] })).method).toBe("listPage");
});

test("listPage rejects invalid cursors at the socket boundary", () => {
	for (const cursor of [null, 1, "", "a".repeat(129)])
		expect(() => validateRequest(request({ cursor }))).toThrow(
			"A list cursor must contain between 1 and 128 characters",
		);
	expect(() => validateRequest(request({ ids: ["../attempt"] }))).toThrow("Session identifiers");
});

test("accepts a full large turn result", () => {
	const value = {
		id: "request",
		version: RUNTIME_PROTOCOL_VERSION,
		method: "turn",
		params: { id: "attempt", token: "token", event: "Stop", result: "x".repeat(2_100_000) },
	};
	expect(validateRequest(value) === value).toBe(true);
	expect(() => validateRequest({ ...value, params: { ...value.params, result: 12 } })).toThrow("must be a string");
});

test("accepts complete control values above the former byte ceilings", () => {
	const token = `token-${"文".repeat(1024)}`;
	const input = Buffer.alloc(1024 * 1024 + 1, 120).toString("base64");
	const values = [
		{
			id: "request",
			version: RUNTIME_PROTOCOL_VERSION,
			method: "registerNativeDelivery",
			params: { id: "attempt", token, messageId: "message", promptDigest: "a".repeat(64) },
		},
		{
			id: "request",
			version: RUNTIME_PROTOCOL_VERSION,
			method: "observe",
			params: { id: "attempt", token, event: { kind: "idle" } },
		},
		{
			id: "request",
			version: RUNTIME_PROTOCOL_VERSION,
			method: "turn",
			params: { id: "attempt", token, event: "Stop" },
		},
		{
			id: "request",
			version: RUNTIME_PROTOCOL_VERSION,
			method: "input",
			params: { id: "attempt", data: input, userInput: true },
		},
	];

	for (const value of values) expect(validateRequest(value) === value).toBe(true);
});

test("accepts terminal dimensions through the PTY encoding range", () => {
	const value = {
		id: "request",
		version: RUNTIME_PROTOCOL_VERSION,
		method: "resize",
		params: { id: "attempt", cols: 1001, rows: MAX_TERMINAL_DIMENSION },
	};

	expect(validateRequest(value) === value).toBe(true);
	for (const dimension of [0, 1.5, MAX_TERMINAL_DIMENSION + 1])
		expect(() => validateRequest({ ...value, params: { ...value.params, cols: dimension } })).toThrow(
			`Terminal dimensions must be between 1 and ${MAX_TERMINAL_DIMENSION}`,
		);
});

test("accepts every positive safe process timeout", () => {
	const value = {
		id: "request",
		version: RUNTIME_PROTOCOL_VERSION,
		method: "start",
		params: {
			id: "attempt",
			command: "true",
			args: [],
			cwd: "/tmp",
			mode: "stdio",
			timeoutMs: Number.MAX_SAFE_INTEGER,
		},
	};
	expect(validateRequest(value) === value).toBe(true);
	for (const timeoutMs of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
		expect(() => validateRequest({ ...value, params: { ...value.params, timeoutMs } })).toThrow(
			"Process timeout must be a positive safe integer",
		);
});

test("accepts a queued delivery", () => {
	const value = {
		id: "request",
		version: RUNTIME_PROTOCOL_VERSION,
		method: "queueInput",
		params: { id: "attempt", messageId: "status-request", data: "c3RhdHVz" },
	};
	expect(validateRequest(value) === value).toBe(true);
});

test("validates large observer deliveries under the Node runtime", async () => {
	const validator = new URL("./validateRequest.ts", import.meta.url).href;
	const child = Bun.spawn(
		[
			"node",
			"--input-type=module",
			"-e",
			`import assert from "node:assert/strict";
import { validateRequest } from ${JSON.stringify(validator)};
const prompt = "context ".repeat(2 * 1024 * 1024);
const envelope = "\\u001b[200~trellis-message:message\\n" + prompt + "\\u001b[201~\\r";
for (const method of ["input", "deliver", "queueInput"]) {
	for (const suffix of ["", "x", "xx"]) {
		const bytes = Buffer.from(envelope + suffix);
		const request = {
			id: "request", version: ${RUNTIME_PROTOCOL_VERSION}, method,
			params: { id: "attempt", messageId: "message", data: bytes.toString("base64") },
		};
		assert.equal(validateRequest(request), request);
		assert.deepEqual(Buffer.from(request.params.data, "base64"), bytes);
		request.params.data = request.params.data.slice(0, -4) + "!AAA";
		assert.throws(() => validateRequest(request), /Input must be base64 bytes/);
	}
}`,
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
	expect(stderr).toBe("");
	expect(exitCode).toBe(0);
});

test("rejects malformed base64 for every input method", () => {
	for (const method of ["input", "deliver", "queueInput"] as const) {
		const value = {
			id: "request",
			version: RUNTIME_PROTOCOL_VERSION,
			method,
			params: { id: "attempt", messageId: "message", data: "" },
		};
		for (const data of ["", "AA==", "AAA=", "AAAA", "+/09"])
			expect(validateRequest({ ...value, params: { ...value.params, data } }).method).toBe(method);
		for (const data of ["A", "AA", "AAA", "A===", "====", "=AAA", "AA=A", "AAA\n", "AAAA\n", " AA=", "AA-_", "文AAA"])
			expect(() => validateRequest({ ...value, params: { ...value.params, data } })).toThrow(
				"Input must be base64 bytes",
			);
	}
});

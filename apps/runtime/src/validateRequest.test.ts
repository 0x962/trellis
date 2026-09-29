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

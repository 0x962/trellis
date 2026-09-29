import { expect, test } from "bun:test";
import { RUNTIME_PROTOCOL_VERSION } from "@trellis/runtime-protocol";
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

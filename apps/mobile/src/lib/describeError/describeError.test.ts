import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { errors } from "@trellis/api";
import { describeError, hostOf } from "./describeError";

const serverUrl = "http://192.168.1.20:4521";

describe("describeError", () => {
	test("a rejected fetch names the host and asks for the server actions", () => {
		expect(describeError(new TypeError("Network request failed"), serverUrl)).toEqual({
			title: "Cannot reach the server",
			detail: "192.168.1.20:4521 does not answer.",
			unreachable: true,
		});
	});

	test("a runtime that throws a plain Error for a lost socket is the same failure", () => {
		expect(describeError(new Error("fetch failed"), serverUrl).unreachable).toBe(true);
	});

	test("a declared error carries the server's own message", () => {
		const error = new ORPCError("VERSION_CONFLICT", {
			defined: true,
			status: errors.VERSION_CONFLICT.status,
			message: errors.VERSION_CONFLICT.message,
		});
		expect(describeError(error, serverUrl)).toEqual({
			title: "The server sent an error",
			detail: errors.VERSION_CONFLICT.message,
			unreachable: false,
		});
	});

	test("a refused input lists the message of every field", () => {
		const error = new ORPCError("INPUT_VALIDATION_FAILED", {
			defined: true,
			status: errors.INPUT_VALIDATION_FAILED.status,
			message: errors.INPUT_VALIDATION_FAILED.message,
			data: { issues: [{ message: "Title is required" }, { message: "Priority is not a priority" }] },
		});
		expect(describeError(error, serverUrl).detail).toBe("Title is required, Priority is not a priority");
	});

	test("a rejection the app does not know shows its own text", () => {
		expect(describeError(new RangeError("out of range"), serverUrl).detail).toBe("out of range");
		expect(describeError("plain string", serverUrl).detail).toBe("plain string");
	});
});

describe("hostOf", () => {
	test("the host drops the scheme and keeps the port", () => {
		expect(hostOf("http://192.168.1.20:4521")).toBe("192.168.1.20:4521");
		expect(hostOf("https://my-mac.tail1a2b3c.ts.net")).toBe("my-mac.tail1a2b3c.ts.net");
	});
});

import { describe, expect, test } from "bun:test";
import { blockReason, statusText } from "./dependencyText.ts";

describe("dependency text", () => {
	test("names each status", () => {
		expect(statusText({ status: "todo", isQuestion: false })).toBe("todo");
		expect(statusText({ status: "started", isQuestion: false })).toBe("in progress");
		expect(statusText({ status: "review", isQuestion: false })).toBe("agent review");
		expect(statusText({ status: "review", isQuestion: true })).toBe("human review");
		expect(statusText({ status: "done", isQuestion: false })).toBe("done");
		expect(statusText({ status: "canceled", isQuestion: false })).toBe("canceled");
	});

	test("names the reason for each dependency kind", () => {
		expect(blockReason({ isQuestion: false })).toBe("is not merged");
		expect(blockReason({ isQuestion: true })).toBe("is open");
	});
});

import { describe, expect, test } from "bun:test";
import { statusText } from "./dependencyText.ts";

describe("dependency text", () => {
	test("names each status", () => {
		expect(statusText({ status: "todo" })).toBe("todo");
		expect(statusText({ status: "started" })).toBe("in progress");
		expect(statusText({ status: "review" })).toBe("agent review");
		expect(statusText({ status: "done" })).toBe("done");
		expect(statusText({ status: "canceled" })).toBe("canceled");
	});
});

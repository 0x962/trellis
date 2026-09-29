import { expect, test } from "bun:test";
import { observerHarnessFailure } from "./observerHarnessFailure.ts";

test.each([
	"Prompt is too long: private text",
	"Context window exceeded: private text",
	"Too many input tokens: private text",
])("classifies capacity at the launch boundary", (message) => {
	expect(observerHarnessFailure(new Error(message))).toMatchObject({ code: "OBSERVER_CONTEXT_CAPACITY" });
	expect(observerHarnessFailure(new Error(message)).message).not.toContain("private text");
});

test("does not expose runtime error details", () => {
	expect(observerHarnessFailure(new Error("token=private"))).toMatchObject({ code: "OBSERVER_HARNESS_FAILED" });
	expect(observerHarnessFailure(new Error("token=private")).message).not.toContain("private");
});

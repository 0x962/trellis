import { expect, test } from "bun:test";
import { notificationText } from "./notificationText";

test("a failed notification shows its saved error", () => {
	expect(notificationText({ state: "failed", error: "The project concurrency limit stopped the start." })).toBe(
		"Not delivered. The project concurrency limit stopped the start.",
	);
});

test.each([
	["pending", "Queued"],
	["sending", "Queued"],
	["sent", "Notified"],
	["unknown", "Delivery uncertain. Check the agent before another mention."],
])("%s notification text", (state, expected) => {
	expect(notificationText({ state: state as "pending", error: null })).toBe(expected);
});

import { expect, test } from "bun:test";
import { validateHarnessEvent } from "./validateHarnessEvent";

const text = "Large prompt 文\n".repeat(200_000);

for (const event of [
	{ kind: "prompt", prompt: text },
	{ kind: "message", message: { text } },
	{ kind: "idle", result: text },
]) {
	test(`accepts complete large ${event.kind} events`, () => {
		expect(() => validateHarnessEvent(event)).not.toThrow();
	});
}

test("rejects non-string prompt and message text", () => {
	expect(() => validateHarnessEvent({ kind: "prompt", prompt: 12 })).toThrow("must be a string");
	expect(() => validateHarnessEvent({ kind: "message", message: { text: 12 } })).toThrow("requires text");
});

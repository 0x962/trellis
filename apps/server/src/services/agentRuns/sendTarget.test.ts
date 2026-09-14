import { expect, test } from "bun:test";
import { assertSendTarget } from "./sendTarget.ts";

test("a claimed delivery cannot target a replacement conversation or terminal", () => {
	const run = { terminalId: "new-terminal", sessionId: "conversation" };
	expect(() => assertSendTarget(run, { expectedTerminalId: "old-terminal" })).toThrow();
	expect(() => assertSendTarget(run, { expectedSessionId: "old-conversation" })).toThrow();
	expect(() =>
		assertSendTarget(run, { expectedTerminalId: "new-terminal", expectedSessionId: "conversation" }),
	).not.toThrow();
});

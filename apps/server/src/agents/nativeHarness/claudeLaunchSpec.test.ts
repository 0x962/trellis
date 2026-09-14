import { expect, test } from "bun:test";
import { claudeLaunchSpec } from "./claudeLaunchSpec.ts";
import { claudeUserMessage } from "./claudeUserMessage.ts";

test("Claude launch uses stdio control without permission bypass", () => {
	const spec = claudeLaunchSpec({ attemptId: "attempt", sessionId: "session", cwd: "/tmp/project" });
	expect(spec.mode).toBe("stdio");
	expect(spec.args).toContain("--replay-user-messages");
	expect(spec.args).toContain("--permission-prompt-tool");
	expect(spec.args).not.toContain("--dangerously-skip-permissions");
	expect(spec.separateStderr).toBe(true);
});
test("a user message preserves its delivery and session identifiers", () => {
	const message = JSON.parse(Buffer.from(claudeUserMessage("session", "message", "hello"), "base64").toString());
	expect(message.uuid).toBe("message");
	expect(message.session_id).toBe("session");
	expect(message.message.content).toBe("hello");
});

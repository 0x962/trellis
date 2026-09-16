import { expect, test } from "bun:test";
import { museTranscriptLine } from "./museTerminal.ts";

test("the Muse transcript drops the Trellis message receipt line and names tools and results", () => {
	expect(museTranscriptLine({ kind: "prompt", prompt: "trellis-message:abc\nFix the bug" })).toBe("\n❯ Fix the bug");
	expect(museTranscriptLine({ kind: "prompt", prompt: "typed by hand" })).toBe("\n❯ typed by hand");
	expect(museTranscriptLine({ kind: "tool-start", tool: { id: "t", name: "bash", input: { command: "pwd" } } })).toBe(
		'◆ bash {"command":"pwd"}',
	);
	expect(museTranscriptLine({ kind: "tool-end", tool: { id: "t", name: "bash" }, error: "exit 1" })).toBe(
		"  ✗ bash: exit 1",
	);
	expect(museTranscriptLine({ kind: "message", message: { text: "done" } })).toBe("◆ done");
	expect(museTranscriptLine({ kind: "idle", outcome: "interrupted" })).toBe("─ interrupted");
	expect(museTranscriptLine({ kind: "session", sessionId: "s", model: "meta/muse-spark-1.3" })).toBe(
		"Muse · meta/muse-spark-1.3 · session s",
	);
	expect(museTranscriptLine({ kind: "working" })).toBeNull();
});

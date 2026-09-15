import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { HarnessObservations } from "./harnessObservations.ts";

let home: string;
let path: string;
let observations: HarnessObservations;
beforeEach(() => {
	home = mkdtempSync("/tmp/trl-observation-errors-");
	path = join(home, "events");
	observations = new HarnessObservations(path);
	observations.append({ kind: "prompt", turnId: "turn", prompt: "Run the task" }, "now");
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

test("tool errors stay in the event journal without a session error, including after replay", () => {
	observations.append({ kind: "tool-start", tool: { id: "tool", name: "Bash" } }, "now");
	observations.append({ kind: "tool-end", tool: { id: "tool", name: "Bash" }, error: "exit 1" }, "now");
	expect(observations.agent).toMatchObject({ error: null, outcome: null, tool: null });
	expect(new HarnessObservations(path).agent).toMatchObject({ error: null, outcome: null });
	expect(Buffer.from(observations.log.read(0).data, "base64").toString()).toContain('"error":"exit 1"');
	observations.append({ kind: "idle", outcome: "completed", result: "Task complete" }, "now");
	expect(observations.agent).toMatchObject({ error: null, outcome: "completed" });
});

test("only a successful native completion clears a failure in the same turn", () => {
	observations.append({ kind: "error", error: "Provider failure", outcome: "failed" }, "now");
	observations.append({ kind: "tool-end", tool: { id: "tool", name: "Bash", output: "ok" } }, "now");
	observations.append({ kind: "idle" }, "now");
	expect(observations.agent).toMatchObject({ error: "Provider failure", outcome: "failed" });
	observations.append({ kind: "idle", outcome: "completed", result: "Task complete" }, "now");
	expect(observations.agent).toMatchObject({ error: null, outcome: "completed" });
	expect(new HarnessObservations(path).agent).toMatchObject({ error: null, outcome: "completed" });
});

test("a failed native completion retains its error through interruption", () => {
	observations.append({ kind: "idle", outcome: "failed", error: "Provider failure" }, "now");
	expect(observations.agent).toMatchObject({ error: "Provider failure", outcome: "failed" });
	observations.append({ kind: "idle", outcome: "interrupted" }, "now");
	expect(observations.agent).toMatchObject({ error: "Provider failure", outcome: "interrupted" });
});

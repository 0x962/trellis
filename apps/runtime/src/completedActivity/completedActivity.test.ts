import { expect, test } from "bun:test";
import { CompletedActivity } from "./completedActivity.ts";

const at = "2026-09-29T12:00:00.000Z";

test("a saved activity state suppresses replay and retains open tool evidence", () => {
	const first = new CompletedActivity();
	const message = {
		kind: "message" as const,
		turnId: "turn",
		message: { id: "answer", text: "Done.", complete: true },
	};
	first.derive(message, at);
	first.derive({ kind: "tool-start", turnId: "turn", tool: { id: "tool", name: "Shell", input: "read file" } }, at);
	first.derive({ kind: "tool-update", turnId: "turn", tool: { id: "tool", name: "Shell", output: "first" } }, at);
	const resumed = new CompletedActivity(first.snapshot());
	expect(resumed.derive(message, at).activity).toBeUndefined();
	const end = { kind: "tool-end" as const, turnId: "turn", tool: { id: "tool", name: "Shell" } };
	expect(resumed.derive(end, at).activity).toMatchObject({ tool: { input: "read file", updates: ["first"] } });
	expect(resumed.derive(end, at).activity).toBeUndefined();
});

test("unproven message text remains context beside completed tools and urgent signals", () => {
	const state = new CompletedActivity();
	const preview = state.derive(
		{ kind: "message", turnId: "turn", message: { id: "part", text: "Partial text", complete: false } },
		at,
	);
	expect(preview.activity).toBeUndefined();
	expect(preview.context).toMatchObject({ text: "Partial text", completeness: "unproven" });
	for (let index = 0; index < 20; index++)
		expect(
			state.derive({ kind: "tool-end", turnId: "turn", tool: { id: `tool-${index}`, name: "Read", output: index } }, at)
				.activity?.kind,
		).toBe("tool");
	const question = state.derive(
		{
			kind: "input-request",
			turnId: "turn",
			inputRequest: { id: "question", kind: "question", title: "Continue?", blocking: true },
		},
		at,
	);
	expect(question.signal?.kind).toBe("input-request");
	const completed = state.derive(
		{ kind: "idle", turnId: "turn", outcome: "completed", result: "Partial text", resultActivityIds: ["part"] },
		at,
	);
	expect(completed.activity).toBeUndefined();
	expect(completed.signal).toMatchObject({ kind: "completion", messageAvailability: "unavailable" });
});

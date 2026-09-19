import { expect, test } from "bun:test";
import { FlowHarnessSchema, FlowNodeInputSchema } from "./flow.ts";

const step = {
	id: "01J9Z0000000000000000000N1",
	parentId: null,
	kind: "agent" as const,
	title: "Review",
	instruction: "Read the diff.",
	minutes: null,
	maxRounds: null,
	x: 0,
	y: 0,
	width: null,
	height: null,
};

test("a step without a harness field stores null", () => {
	expect(FlowNodeInputSchema.parse(step).harness).toBeNull();
});

test("an agent, a gate, and a loop take a harness; a group and a human do not", () => {
	const codex = { preset: "codex", model: "openai/gpt-5.6-sol" };
	expect(FlowNodeInputSchema.safeParse({ ...step, harness: codex }).success).toBe(true);
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "gate", harness: codex }).success).toBe(true);
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "loop", maxRounds: 3, harness: codex }).success).toBe(true);
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "group", harness: codex }).success).toBe(false);
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "human", harness: codex }).success).toBe(false);
});

test("a flow harness names a native preset and an effort its model supports", () => {
	expect(FlowHarnessSchema.safeParse({ preset: "custom" }).success).toBe(false);
	expect(FlowHarnessSchema.safeParse({ preset: "claude", startCommand: "claude" }).success).toBe(false);
	expect(FlowHarnessSchema.safeParse({ preset: "claude", effort: "not-an-effort" }).success).toBe(false);
	expect(
		FlowHarnessSchema.safeParse({ preset: "claude", model: "anthropic/claude-opus-5", effort: "high" }).success,
	).toBe(true);
});

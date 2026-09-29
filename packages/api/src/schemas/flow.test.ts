import { expect, test } from "bun:test";
import {
	FlowCreateInputSchema,
	FlowHarnessSchema,
	FlowNodeInputSchema,
	FlowSaveInputSchema,
	FlowSlugSchema,
	FlowUpdateInputSchema,
} from "./flow.ts";

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

test("only a gate without a harness takes a Jev review area", () => {
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "gate", reviewArea: "frontend" }).success).toBe(true);
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "gate", reviewArea: "backend" }).success).toBe(true);
	expect(FlowNodeInputSchema.safeParse({ ...step, reviewArea: "frontend" }).success).toBe(false);
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "gate", reviewArea: "both" }).success).toBe(false);
	expect(
		FlowNodeInputSchema.safeParse({ ...step, kind: "gate", reviewArea: "frontend", harness: { preset: "codex" } })
			.success,
	).toBe(false);
});

test("accepts flow text and slugs above the former limits", () => {
	const slug = `flow-${"s".repeat(64)}`;
	expect(
		FlowCreateInputSchema.safeParse({
			name: "n".repeat(121),
			slug,
			description: "d".repeat(2001),
		}).success,
	).toBe(true);
	expect(
		FlowUpdateInputSchema.safeParse({
			flow: "f".repeat(65),
			name: "n".repeat(121),
			slug,
			description: "d".repeat(2001),
			briefing: "b".repeat(200_001),
		}).success,
	).toBe(true);
	expect(FlowSlugSchema.safeParse("Flow slug").success).toBe(false);
});

test("accepts node values above the former canvas and execution limits", () => {
	expect(
		FlowNodeInputSchema.safeParse({
			...step,
			kind: "group",
			title: "t".repeat(121),
			instruction: "i".repeat(200_001),
			minutes: 1441,
			x: 1_000_001,
			y: -1_000_001,
			width: 100_001,
			height: 100_001,
		}).success,
	).toBe(true);
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "loop", maxRounds: 51 }).success).toBe(true);
});

test("retains node format, kind, finite-number, and storage-range checks", () => {
	expect(FlowNodeInputSchema.safeParse({ ...step, id: "not-an-id" }).success).toBe(false);
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "agent", minutes: 1 }).success).toBe(false);
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "group", maxRounds: 1 }).success).toBe(false);
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "group", minutes: 0 }).success).toBe(false);
	expect(FlowNodeInputSchema.safeParse({ ...step, kind: "loop", maxRounds: 2_147_483_648 }).success).toBe(false);
	expect(FlowNodeInputSchema.safeParse({ ...step, x: Number.POSITIVE_INFINITY }).success).toBe(false);
	expect(FlowNodeInputSchema.safeParse({ ...step, width: Number.NaN }).success).toBe(false);
	expect(FlowNodeInputSchema.safeParse({ ...step, width: 39 }).success).toBe(false);
});

test("accepts graph counts above the former limits", () => {
	const id = (kind: "node" | "edge", index: number) =>
		`${kind === "node" ? "01J9Z00000000000000000" : "01J9Y00000000000000000"}${String(index).padStart(4, "0")}`;
	const nodes = Array.from({ length: 501 }, (_, index) => ({ ...step, id: id("node", index) }));
	const edges = Array.from({ length: 2001 }, (_, index) => ({
		id: id("edge", index),
		fromNodeId: nodes[0]!.id,
		toNodeId: nodes[1]!.id,
		branch: "out" as const,
	}));

	expect(FlowSaveInputSchema.safeParse({ flow: "review", nodes, edges }).success).toBe(true);
});

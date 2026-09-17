import { expect, test } from "bun:test";
import { FlowCreateInputSchema, FlowNodeInputSchema } from "./flow.ts";

const nodeId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

const node = {
	id: nodeId,
	parentId: null,
	kind: "agent",
	title: "Read the diff",
	personaId: null,
	instruction: "Read the diff and report every finding.",
	minutes: null,
	maxRounds: null,
	x: 0,
	y: 0,
	width: null,
	height: null,
};

// A person types the flow name and the flow description in the flow dialog, so
// each bound reads as a sentence and never as zod's own wording.
test("a flow name or description out of bounds reads as a sentence", () => {
	const message = (input: Record<string, unknown>) =>
		FlowCreateInputSchema.safeParse({ name: "Review", ...input }).error!.issues[0]!.message;
	expect(message({ name: "" })).toBe("Enter a flow name of 1 to 120 characters.");
	expect(message({ name: "n".repeat(121) })).toBe("Enter a flow name of 1 to 120 characters.");
	expect(message({ description: "d".repeat(2001) })).toBe("Enter a flow description of 2000 characters or less.");
});

// A person types the title and the instruction of a step on the flow canvas.
test("a step title or instruction over the bound reads as a sentence", () => {
	const message = (input: Record<string, unknown>) =>
		FlowNodeInputSchema.safeParse({ ...node, ...input }).error!.issues[0]!.message;
	expect(message({ title: "t".repeat(121) })).toBe("Enter a step title of 120 characters or less.");
	expect(message({ instruction: "i".repeat(200_001) })).toBe("Enter a step instruction of 200,000 characters or less.");
});

import { expect, test } from "bun:test";
import { EpicWhiteboardSaveInputSchema } from "./epicWhiteboard.ts";

test("whiteboard writes require a JSON object and a database revision", () => {
	const input = { epic: "TRL/plan", snapshot: { shapes: [{ points: [1, 2], name: null }] }, expectedRevision: 0 };
	expect(EpicWhiteboardSaveInputSchema.parse(input)).toEqual(input);
	for (const snapshot of [null, [], "text", { bad: undefined }, { bad: Number.NaN }])
		expect(EpicWhiteboardSaveInputSchema.safeParse({ ...input, snapshot }).success).toBe(false);
	for (const expectedRevision of [-1, 0.5, Number.POSITIVE_INFINITY, 2_147_483_647])
		expect(EpicWhiteboardSaveInputSchema.safeParse({ ...input, expectedRevision }).success).toBe(false);
});

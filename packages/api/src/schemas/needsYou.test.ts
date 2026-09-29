import { expect, test } from "bun:test";
import { NeedsYouListInputSchema, NeedsYouListOutputSchema, NeedsYouUpdateInputSchema } from "./needsYou";

const id = "opaque-attention-id:".repeat(100);
const until = "2026-10-01T12:00:00.000Z";

test("Needs You preserves complete opaque cursor identifiers across pages", () => {
	const nextCursor = { query: "query", key: "0", age: until, id };
	const output = NeedsYouListOutputSchema.parse({ total: 1, items: [], nextCursor });
	const input = NeedsYouListInputSchema.parse({ cursor: output.nextCursor });
	expect(input.cursor).toEqual(nextCursor);
});

for (const action of ["snooze", "ignore", "restore"] as const) {
	test(`Needs You ${action} preserves the complete identifier`, () => {
		expect(NeedsYouUpdateInputSchema.parse({ id, action, until }).id).toBe(id);
		expect(NeedsYouUpdateInputSchema.safeParse({ id: "", action, until }).success).toBe(false);
	});
}

test("Needs You retains timestamp validation and page size bounds", () => {
	expect(NeedsYouUpdateInputSchema.safeParse({ id, action: "snooze", until: "tomorrow" }).success).toBe(false);
	for (const limit of [0, 201, 1.5]) {
		expect(NeedsYouListInputSchema.safeParse({ limit }).success).toBe(false);
	}
});

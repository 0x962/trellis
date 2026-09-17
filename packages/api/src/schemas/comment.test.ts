import { expect, test } from "bun:test";
import { CommentCreateInputSchema, CommentSchema } from "./comment.ts";

const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const comment = {
	id,
	ticketId: id,
	body: "Question",
	actor: { name: "dana", kind: "human" },
	createdAt: "2026-09-10T12:00:00.000Z",
	updatedAt: "2026-09-10T12:00:00.000Z",
};

test("legacy comments parse as unresolved roots", () => {
	expect(CommentSchema.parse(comment)).toMatchObject({ parentId: null, resolvedAt: null });
});

test("comment create accepts a parent id and rejects a malformed parent id", () => {
	expect(CommentCreateInputSchema.parse({ ticket: "TRL-18", body: "Answer", parentId: id }).parentId).toBe(id);
	expect(CommentCreateInputSchema.safeParse({ ticket: "TRL-18", body: "Answer", parentId: "wrong" }).success).toBe(
		false,
	);
});

// A person types a comment body, so each bound reads as a sentence.
test("a comment body out of bounds reads as a sentence", () => {
	const message = (body: string) =>
		CommentCreateInputSchema.safeParse({ ticket: "TRL-18", body }).error!.issues[0]!.message;
	expect(message("")).toBe("Enter a comment of 1 to 200,000 characters.");
	expect(message("b".repeat(200_001))).toBe("Enter a comment of 1 to 200,000 characters.");
});

import { expect, test } from "bun:test";
import { NoteCreateInputSchema } from "./note.ts";

// A person types the title and the body in the note dialog, so each bound
// reads as a sentence and never as zod's own wording.
test("a note field out of bounds reads as a sentence", () => {
	const message = (input: { title: string; body: string }) =>
		NoteCreateInputSchema.safeParse({ project: "TRL", ...input }).error!.issues[0]!.message;
	expect(message({ title: "", body: "The disk is full." })).toBe("Enter a note title of 1 to 120 characters.");
	expect(message({ title: "t".repeat(121), body: "The disk is full." })).toBe(
		"Enter a note title of 1 to 120 characters.",
	);
	expect(message({ title: "Disk", body: "" })).toBe("Enter a note body of 1 to 4000 characters.");
	expect(message({ title: "Disk", body: "b".repeat(4001) })).toBe("Enter a note body of 1 to 4000 characters.");
});

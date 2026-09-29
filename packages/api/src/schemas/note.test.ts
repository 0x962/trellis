import { expect, test } from "bun:test";
import { NoteBodySchema, NoteCreateInputSchema, NoteUpdateInputSchema } from "./note.ts";

test("note requests retain complete multibyte bodies beyond 4000 characters", () => {
	const body = "漢字 café 𐐷\n".repeat(2000).trim();
	expect(NoteBodySchema.parse(body)).toBe(body);
	expect(NoteCreateInputSchema.parse({ project: "TST", title: "Note", body }).body).toBe(body);
	expect(NoteUpdateInputSchema.parse({ id: "01M3NZ5333VR1N2XZ8G9KFGPDJ", body }).body).toBe(body);
});

test("note requests still reject empty bodies and trim outer whitespace", () => {
	for (const body of ["", " \n\t "]) {
		expect(NoteBodySchema.safeParse(body).success).toBe(false);
	}
	expect(NoteBodySchema.parse("  漢字 café\n")).toBe("漢字 café");
});

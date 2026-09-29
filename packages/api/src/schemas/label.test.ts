import { expect, test } from "bun:test";
import { LabelGroupRefSchema, LabelRefSchema } from "../refs.ts";
import {
	LabelCreateInputSchema,
	LabelDescriptionSchema,
	LabelGroupCreateInputSchema,
	LabelGroupNameSchema,
	LabelGroupUpdateInputSchema,
	LabelNameSchema,
	LabelUpdateInputSchema,
} from "./label.ts";

const id = "01J00000000000000000000010";
const name = "Label text ".repeat(1000).trim();
const description = "A complete description. ".repeat(1000).trim();

test("label creates and updates preserve complete text", () => {
	const fields = { name, description };
	expect(LabelCreateInputSchema.parse({ project: "TST", ...fields })).toMatchObject(fields);
	expect(LabelUpdateInputSchema.parse({ project: "TST", label: id, ...fields })).toMatchObject(fields);
	expect(LabelDescriptionSchema.parse(` ${description} `)).toBe(description);
});

test("group creates, updates, and name references preserve complete names", () => {
	expect(LabelGroupCreateInputSchema.parse({ project: "TST", name }).name).toBe(name);
	expect(LabelGroupUpdateInputSchema.parse({ project: "TST", group: id, name }).name).toBe(name);
	expect(LabelGroupRefSchema.parse(name)).toEqual({ kind: "name", name: name.toLowerCase() });
	expect(LabelRefSchema.parse(`${name}/${name}`)).toEqual({
		kind: "name",
		group: name.toLowerCase(),
		name: name.toLowerCase(),
	});
});

test("name validation retains whitespace, separator, and reserved-name rules", () => {
	for (const schema of [LabelNameSchema, LabelGroupNameSchema]) {
		expect(schema.parse(` ${name} `)).toBe(name);
		for (const invalid of ["", "   ", "one,two", "one/two", "NoNe"]) {
			expect(schema.safeParse(invalid).success).toBe(false);
		}
	}
	for (const invalid of ["", "one,two", "one/two/three"]) {
		expect(LabelRefSchema.safeParse(invalid).success).toBe(false);
	}
});

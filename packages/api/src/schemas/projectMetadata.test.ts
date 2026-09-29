import { expect, test } from "bun:test";
import { StatusRefStringSchema } from "../refs.ts";
import { ProjectCreateInputSchema, ProjectUpdateInputSchema } from "./project.ts";
import { StatusCreateInputSchema, StatusSummarySchema, StatusUpdateInputSchema } from "./status.ts";

const name = `Review ${"界🙂é".repeat(1000)}`;
const description = "Complete description 界🙂é\n".repeat(1000);

test("project create and edit preserve long multibyte names", () => {
	expect(ProjectCreateInputSchema.parse({ key: "LONG", name }).name).toBe(name);
	expect(ProjectUpdateInputSchema.parse({ project: "LONG", name }).name).toBe(name);
	expect(ProjectCreateInputSchema.safeParse({ key: "LONG", name: "" }).success).toBe(false);
});

test("status create, edit, and summary preserve complete metadata", () => {
	const input = { project: "LONG", name, description };
	expect(StatusCreateInputSchema.parse({ ...input, category: "review" })).toMatchObject(input);
	expect(StatusUpdateInputSchema.parse({ ...input, status: "todo" })).toMatchObject(input);
	expect(
		StatusSummarySchema.parse({
			id: "01J00000000000000000000001",
			slug: "review",
			name,
			category: "review",
			color: "fg",
		}).name,
	).toBe(name);
	expect(StatusCreateInputSchema.safeParse({ ...input, name: "", category: "review" }).success).toBe(false);
	expect(StatusUpdateInputSchema.safeParse({ ...input, status: "todo", category: "done" }).success).toBe(false);
});

test("status references preserve long names and reserved category syntax", () => {
	expect(StatusRefStringSchema.parse(name)).toBe(name.toLowerCase());
	expect(StatusRefStringSchema.parse("CATEGORY:REVIEW")).toBe("category:review");
	for (const value of ["", "category:other", "review:other", `category:${name}`]) {
		expect(StatusRefStringSchema.safeParse(value).success).toBe(false);
	}
});

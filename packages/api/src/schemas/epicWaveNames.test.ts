import { expect, test } from "bun:test";
import { EpicCreateInputSchema, EpicNameSchema, EpicUpdateInputSchema } from "./epic";
import { WaveCreateInputSchema, WaveNameSchema, WaveUpdateInputSchema } from "./wave";

const name = "Complete café 名称 ".repeat(300).trim();

test("epic and wave create and rename inputs preserve complete names", () => {
	expect(EpicCreateInputSchema.parse({ project: "TST", name }).name).toBe(name);
	expect(EpicUpdateInputSchema.parse({ epic: "TST/plan", name }).name).toBe(name);
	expect(WaveCreateInputSchema.parse({ epic: "TST/plan", name }).name).toBe(name);
	expect(WaveUpdateInputSchema.parse({ wave: "TST/plan/first", name }).name).toBe(name);
});

test("epic and wave names retain trim and nonempty validation", () => {
	for (const schema of [EpicNameSchema, WaveNameSchema]) {
		expect(schema.parse(`  ${name}  `)).toBe(name);
		expect(schema.safeParse("").success).toBe(false);
		expect(schema.safeParse(" \t\n ").success).toBe(false);
	}
});

test("long names do not change the reference and slug syntax", () => {
	expect(EpicCreateInputSchema.safeParse({ project: "TST", name, slug: "bad/slug" }).success).toBe(false);
	expect(WaveCreateInputSchema.safeParse({ epic: "TST/plan", name, slug: "bad/slug" }).success).toBe(false);
	expect(EpicUpdateInputSchema.safeParse({ epic: "TST/plan/first", name }).success).toBe(false);
	expect(WaveUpdateInputSchema.safeParse({ wave: "TST/plan", name }).success).toBe(false);
});

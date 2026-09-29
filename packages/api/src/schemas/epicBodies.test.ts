import { expect, test } from "bun:test";
import { EpicCreateInputSchema, EpicUpdateInputSchema } from "./epic.ts";
import { ResourceAddInputSchema, ResourceUpdateInputSchema } from "./resource.ts";

const text = `  # Plan\n${"文é𝄞\n".repeat(60_000)}tail  `;
const id = "01M3NZ53BTVR1YTW3AVPRY348C";

test("epic create and edit preserve long multibyte plans", () => {
	expect(EpicCreateInputSchema.parse({ project: "TRL", name: "Plan", description: text }).description).toBe(text);
	expect(EpicUpdateInputSchema.parse({ epic: "TRL/plan", description: text }).description).toBe(text);
	expect(EpicUpdateInputSchema.parse({ epic: "TRL/plan", description: "" }).description).toBe("");
	expect(EpicUpdateInputSchema.safeParse({ epic: "TRL/plan", description: 3 }).success).toBe(false);
});

test("resource create and edit preserve long multibyte document bodies", () => {
	const created = ResourceAddInputSchema.parse({ epic: "TRL/plan", kind: "doc", name: "Plan", body: text });
	expect(created.kind).toBe("doc");
	if (created.kind !== "doc") throw new Error("Expected a document");
	expect(created.body).toBe(text);
	expect(ResourceUpdateInputSchema.parse({ id, body: text }).body).toBe(text);
	expect(ResourceUpdateInputSchema.parse({ id, body: "" }).body).toBe("");
	expect(ResourceUpdateInputSchema.safeParse({ id, body: null }).success).toBe(false);
});

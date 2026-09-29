import { expect, test } from "bun:test";
import { ProviderCreateInputSchema, ProviderUpdateInputSchema } from "./provider";

const input = {
	name: "Gateway".repeat(1000),
	kind: "openai-compatible" as const,
	baseUrl: `https://example.com/${"path/".repeat(1000)}`,
	apiKey: "synthetic-key".repeat(1000),
	models: Array.from({ length: 201 }, (_, index) => `${index}/${"model".repeat(1000)}`),
};

test("provider create and update preserve complete configuration", () => {
	const created = ProviderCreateInputSchema.parse(input);
	expect(created.name).toBe(input.name);
	expect(created.baseUrl).toBe(input.baseUrl);
	expect(created.apiKey === input.apiKey).toBe(true);
	expect(created.models).toEqual(input.models);
	const { kind: _kind, ...changes } = input;
	const updated = ProviderUpdateInputSchema.parse({ id: "01M2Q0Z191Q244RDP6R3SBFKE5", ...changes });
	expect(updated.name).toBe(input.name);
	expect(updated.baseUrl).toBe(input.baseUrl);
	expect(updated.apiKey === input.apiKey).toBe(true);
	expect(updated.models).toEqual(input.models);
});

test("provider configuration retains format and uniqueness rules", () => {
	for (const patch of [
		{ name: " " },
		{ apiKey: " " },
		{ baseUrl: "http://example.com" },
		{ baseUrl: "https://user:password@example.com" },
		{ baseUrl: "https://example.com/?" },
		{ baseUrl: "https://example.com/#" },
		{ models: ["model", "model"] },
		{ models: ["model with spaces"] },
		{ models: ["model\u0001"] },
	]) {
		expect(ProviderCreateInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
		expect(ProviderUpdateInputSchema.safeParse({ id: "01M2Q0Z191Q244RDP6R3SBFKE5", ...patch }).success).toBe(false);
	}
});

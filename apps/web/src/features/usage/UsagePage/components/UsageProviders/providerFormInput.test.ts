import { expect, test } from "bun:test";
import type { Provider } from "@trellis/api";
import { initialProviderValue, providerFormDirty, providerFormInput } from "./providerFormInput";

const provider: Provider = {
	id: "01M38GH7SAE00S9CSWCAEAP6CW",
	name: "Vercel",
	kind: "vercel-ai-gateway",
	baseUrl: "https://ai-gateway.vercel.sh",
	keyLast4: "1234",
	enabled: true,
	models: ["typesafe-ai/jev"],
	createdAt: "2026-09-24T00:00:00.000Z",
	updatedAt: "2026-09-24T00:00:00.000Z",
};

test("Edit starts with an empty key and omits it from an update", () => {
	const value = initialProviderValue(provider);
	expect(value.apiKey).toBe("");
	expect(providerFormDirty(value, provider)).toBe(false);
	const result = providerFormInput({ ...value, name: "Work", apiKey: "  " }, provider);
	expect(result.success).toBe(true);
	expect(result.data).not.toHaveProperty("apiKey");
	expect(result.data).not.toHaveProperty("kind");
	expect(providerFormDirty({ ...value, name: "Work" }, provider)).toBe(true);
});
test("Edit sends a replacement key only when entered", () => {
	const value = { ...initialProviderValue(provider), apiKey: " replacement-key " };
	expect(providerFormInput(value, provider).data).toHaveProperty("apiKey", "replacement-key");
	expect(providerFormDirty(value, provider)).toBe(true);
});
test("Add requires a key and a compatible address", () => {
	const value = { ...initialProviderValue(), name: "Endpoint" };
	expect(providerFormInput(value).success).toBe(false);
	expect(providerFormInput({ ...value, apiKey: "key" }).success).toBe(true);
	expect(providerFormInput({ ...value, apiKey: "key", kind: "openai-compatible" }).success).toBe(false);
	expect(
		providerFormInput({ ...value, apiKey: "key", kind: "openai-compatible", baseUrl: "https://api.example.com" })
			.success,
	).toBe(true);
});
test("model order does not make an edit dirty but a changed set does", () => {
	const record = { ...provider, models: ["a", "b"] };
	expect(providerFormDirty({ ...initialProviderValue(record), models: ["b", "a"] }, record)).toBe(false);
	expect(providerFormDirty({ ...initialProviderValue(record), models: ["a"] }, record)).toBe(true);
});

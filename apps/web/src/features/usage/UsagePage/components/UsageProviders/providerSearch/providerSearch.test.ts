import { describe, expect, test } from "bun:test";
import type { Provider } from "@trellis/api";
import { filterProviders } from "./providerSearch";

const provider: Provider = {
	id: "01M38GH7SAE00S9CSWCAEAP6CW",
	name: "Work gateway",
	kind: "vercel-ai-gateway",
	baseUrl: "https://hidden-address.example.test",
	keyLast4: "1234",
	enabled: true,
	models: ["hidden/model"],
	createdAt: "2026-09-24T00:00:00.000Z",
	updatedAt: "2026-09-24T00:00:00.000Z",
};
const other: Provider = {
	...provider,
	id: "01M38GH7SAE00S9CSWCAEAP6CX",
	name: "Local lab",
	kind: "openai-compatible",
	enabled: false,
};

describe("provider search", () => {
	test("preserves all rows and their order for an empty query", () => {
		expect(filterProviders([provider, other], "   ")).toEqual([provider, other]);
	});
	test.each(["WORK", " gateway ", "Vercel AI", "On", "work on vercel"])("matches visible list data for %s", (query) => {
		expect(filterProviders([provider, other], query)).toEqual([provider]);
	});
	test.each(["local", "OpenAI compatible", "Off", "openai off"])(
		"matches a disabled compatible provider for %s",
		(query) => {
			expect(filterProviders([provider, other], query)).toEqual([other]);
		},
	);
	test.each(["hidden-address", "hidden/model", "1234", "refused", "unavailable"])(
		"excludes non-searchable data for %s",
		(query) => {
			expect(filterProviders([provider, other], query)).toEqual([]);
		},
	);
	test("requires each term and finds rows beyond the first virtual range", () => {
		const providers = Array.from({ length: 300 }, (_, index) => ({
			...provider,
			id: String(index),
			name: `Gateway ${index}`,
		}));
		expect(filterProviders(providers, "gateway 299")).toEqual([providers[299]!]);
		expect(filterProviders(providers, "gateway absent")).toEqual([]);
	});
	test("keeps the full provider record for each row action", () => {
		expect(filterProviders([provider], "work")[0]).toBe(provider);
	});
});

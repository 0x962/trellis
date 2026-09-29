import { describe, expect, test } from "bun:test";
import type { Provider } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { providerCheckSummary, UsageProviderRow } from "./UsageProviderCard";

const provider: Provider = {
	id: "01M2Q0Z191Q244RDP6R3SBFKE5",
	name: "Gateway",
	kind: "vercel-ai-gateway",
	baseUrl: "https://ai-gateway.vercel.sh/v1",
	keyLast4: "1234",
	enabled: true,
	models: ["anthropic/claude-opus-5", "openai/gpt-6-astra"],
	createdAt: "2026-09-29T05:00:00.000Z",
	updatedAt: "2026-09-29T06:00:00.000Z",
};

describe("providerCheckSummary", () => {
	test("shows compact provider status and two row actions", () => {
		const html = renderToStaticMarkup(
			<UsageProviderRow
				provider={provider}
				check={{ ok: true, balance: "12.50", detail: null, checkedAt: "2026-09-29T06:00:00.000Z" }}
				checking={false}
				busy={false}
				onCheck={() => {}}
				onEdit={() => {}}
				onRemove={() => {}}
				onToggle={() => {}}
			/>,
		);
		expect(html).toContain("Gateway · On");
		expect(html).toContain("Key accepted · $12.50 left · 2 models");
		expect(html).toContain('aria-label="Check Gateway"');
		expect(html).toContain('aria-label="Actions for Gateway"');
	});

	test("shows an accepted key, its balance, and the model count", () => {
		expect(
			providerCheckSummary({
				provider,
				checking: false,
				check: { ok: true, balance: "12.50", detail: null, checkedAt: "2026-09-29T06:00:00.000Z" },
			}),
		).toBe("Key accepted · $12.50 left · 2 models");
	});

	test("keeps a failed check and its retry state visible", () => {
		expect(providerCheckSummary({ provider, checking: false, error: "The server did not answer." })).toBe(
			"Key check failed · 2 models",
		);
		expect(providerCheckSummary({ provider, checking: true })).toBe("Checking the key… · 2 models");
	});
});

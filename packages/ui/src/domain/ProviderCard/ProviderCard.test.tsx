import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderCard, type ProviderCardProps } from "./ProviderCard";

const props: ProviderCardProps = {
	provider: {
		name: "Vercel",
		kind: "vercel-ai-gateway",
		baseUrl: "https://ai-gateway.vercel.sh",
		keyLast4: "1234",
		enabled: true,
		models: ["typesafe-ai/jev"],
	},
	checking: false,
	onEdit() {},
	onCheck() {},
	onToggle() {},
	onRemove() {},
};
const markup = (patch: Partial<ProviderCardProps>) => renderToStaticMarkup(<ProviderCard {...props} {...patch} />);

describe("ProviderCard", () => {
	test("names the card and all four actions", () => {
		const html = markup({});
		for (const label of ["Vercel", "Edit Vercel", "Check the key of Vercel", "Turn off Vercel", "Remove Vercel"])
			expect(html).toContain(`aria-label="${label}"`);
		expect(html).toContain("Key ••••1234");
		expect(html).toContain("typesafe-ai/jev");
	});
	test("disables the check while it runs", () => {
		const html = markup({ checking: true });
		expect(html).toContain("Checking the key…");
		expect(html).toContain('aria-busy="true"');
		expect(html).toContain("disabled");
	});
	test("prints an accepted key with a tabular balance", () => {
		const html = markup({ check: { ok: true, balance: "95.50", detail: null } });
		expect(html).toContain('class="tabular">$95.50</span> left');
		expect(html).toContain("Key accepted");
		expect(html).toContain("text-success");
	});
	test("prints an accepted key without a balance", () => {
		const html = markup({ check: { ok: true, balance: null, detail: null } });
		expect(html).toContain("Key accepted</p>");
		expect(html).not.toContain("left</");
	});
	test.each([
		["The provider refused the key.", "Paste a new key in Edit.", "text-warning"],
		["The provider refused the request.", "Check the key and the plan at the provider.", "text-warning"],
		["Trellis cannot reach ai-gateway.vercel.sh.", "Check the key again later.", "text-fg-muted"],
	])("prints %s with its action", (detail, action, tone) => {
		const html = markup({ check: { ok: false, balance: null, detail } });
		expect(html).toContain(`${detail} ${action}`);
		expect(html).toContain(`role="status" class="text-sm ${tone}"`);
	});
	test("keeps the last check on a disabled provider", () => {
		const html = markup({
			provider: { ...props.provider, enabled: false, keyLast4: "", models: [] },
			check: { ok: true, balance: null, detail: null },
		});
		expect(html).toContain(" · Off");
		expect(html).toContain('aria-label="Turn on Vercel"');
		expect(html).toContain('aria-pressed="false"');
		expect(html).toContain("Key accepted");
		expect(html).toContain("Key ••••</p>");
		expect(html).toContain("No models. Edit the provider to choose some.");
	});
	test("shows a failed refresh instead of an old success", () => {
		const html = markup({ check: { ok: true, balance: null, detail: null }, error: "The check failed." });
		expect(html).toContain("The check failed.");
		expect(html).not.toContain("Key accepted");
	});
});

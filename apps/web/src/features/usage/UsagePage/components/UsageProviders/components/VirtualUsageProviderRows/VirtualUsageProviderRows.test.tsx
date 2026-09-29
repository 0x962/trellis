import { describe, expect, test } from "bun:test";
import type { Provider } from "@trellis/api";
import { ProviderCard } from "@trellis/ui";
import { renderToStaticMarkup } from "react-dom/server";
import { VirtualUsageProviderRows } from "./VirtualUsageProviderRows";

const provider = (index: number): Provider => ({
	id: `provider-${index}`,
	name: `Provider ${index}`,
	kind: "openai-compatible",
	baseUrl: `https://provider-${index}.example.test`,
	keyLast4: "1234",
	enabled: true,
	models: ["model"],
	createdAt: "2026-09-29T05:00:00.000Z",
	updatedAt: "2026-09-29T06:00:00.000Z",
});

describe("VirtualUsageProviderRows", () => {
	test("bounds the initial render of 300 providers", () => {
		const providers = Array.from({ length: 300 }, (_value, index) => provider(index));
		const html = renderToStaticMarkup(
			<VirtualUsageProviderRows
				providers={providers}
				renderRow={(item, onActiveChange) => (
					<ProviderCard
						provider={item}
						checking={false}
						onEdit={() => {}}
						onCheck={() => {}}
						onToggle={() => {}}
						onRemove={() => {}}
						variant="compact"
						onActiveChange={onActiveChange}
					/>
				)}
			/>,
		);
		expect(html.match(/data-usage-provider=/g)).toHaveLength(16);
		expect(html).toContain("Provider 0 · On");
		expect(html).not.toContain("Provider 299 · On");
	});
});

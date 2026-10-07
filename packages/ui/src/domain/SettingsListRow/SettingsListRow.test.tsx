import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "../../primitives/Badge";
import { SettingsListRow } from "./SettingsListRow";

const render = (props: Partial<React.ComponentProps<typeof SettingsListRow>> = {}) =>
	renderToStaticMarkup(
		<SettingsListRow
			label="Work"
			description="Weekly window · 82% used · Reset time unavailable"
			icon={<span />}
			actions={<span />}
			onEdit={() => {}}
			{...props}
		/>,
	);

describe("SettingsListRow", () => {
	test("uses the shared badge and wraps the complete description", () => {
		const html = render({ badge: "Default", wrapDescription: true });
		const badge = renderToStaticMarkup(
			<Badge tone="accent" size="sm">
				Default
			</Badge>,
		);
		expect(html).toContain(badge);
		expect(html).toContain('aria-label="Edit Work, Default"');
		expect(html).toContain("whitespace-normal text-pretty");
	});

	test("keeps the existing row without a badge or wrapped description", () => {
		const html = render();
		expect(html).toContain('aria-label="Edit Work"');
		expect(html).toContain('class="status-row-description"');
		expect(html).not.toContain(">Default</span>");
		expect(html).not.toContain("whitespace-normal");
	});
});

import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageTabs } from "./PageTabs";

const tabs = [
	{ id: "tickets", title: "Tickets" },
	{ id: "review", title: "Review the tab component" },
];

test("renders the controlled tab state and actions", () => {
	const html = renderToStaticMarkup(
		<PageTabs tabs={tabs} activeId="review" onAdd={() => {}} onSelect={() => {}} onClose={() => {}} />,
	);

	expect(html).toContain('role="tablist"');
	expect(html).toContain('aria-label="Open pages"');
	expect(html).toContain('role="tab"');
	expect(html).toContain('aria-selected="true"');
	expect(html).toContain('aria-label="Close Review the tab component"');
	expect(html).toContain('aria-label="Add tab"');
	expect(html.match(/tabindex="0"/g)).toHaveLength(3);
	expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
});

test("accepts a label for the tab list", () => {
	const html = renderToStaticMarkup(
		<PageTabs
			tabs={tabs}
			activeId="tickets"
			onAdd={() => {}}
			onSelect={() => {}}
			onClose={() => {}}
			aria-label="Project pages"
		/>,
	);

	expect(html).toContain('aria-label="Project pages"');
});

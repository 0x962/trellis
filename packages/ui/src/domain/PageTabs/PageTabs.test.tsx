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

test("bounds the mounted controls and keeps the active tab", () => {
	const manyTabs = Array.from({ length: 1_000 }, (_, index) => ({ id: `tab-${index}`, title: `Page ${index}` }));
	const html = renderToStaticMarkup(
		<PageTabs tabs={manyTabs} activeId="tab-999" onAdd={() => {}} onSelect={() => {}} onClose={() => {}} />,
	);

	expect(html.match(/role="tab"/g)?.length).toBeLessThan(10);
	expect(html).toContain('data-page-tab-id="tab-999"');
	expect(html).not.toContain('data-page-tab-id="tab-0"');
});

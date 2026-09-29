import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageTabs } from "./PageTabs";

const tabs = [
	{ id: "tickets", title: "Tickets", pinned: false },
	{ id: "review", title: "Review the tab component", pinned: false },
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
	const manyTabs = Array.from({ length: 1_000 }, (_, index) => ({
		id: `tab-${index}`,
		title: `Page ${index}`,
		pinned: false,
	}));
	const html = renderToStaticMarkup(
		<PageTabs tabs={manyTabs} activeId="tab-999" onAdd={() => {}} onSelect={() => {}} onClose={() => {}} />,
	);

	expect(html.match(/role="tab"/g)?.length).toBeLessThan(10);
	expect(html).toContain('data-page-tab-id="tab-999"');
	expect(html).not.toContain('data-page-tab-id="tab-0"');
});

test("draws a header before each group and hides the tabs of a collapsed group", () => {
	const groups = [
		{ id: "g", name: "Reviews", collapsed: false },
		{ id: "h", name: "Later", collapsed: true },
	];
	const groupedTabs = [
		{ id: "b", title: "B", pinned: false, groupId: "g" },
		{ id: "c", title: "C", pinned: false, groupId: "g" },
		{ id: "d", title: "D", pinned: false, groupId: "h" },
		{ id: "a", title: "A", pinned: false },
	];
	const html = renderToStaticMarkup(
		<PageTabs
			tabs={groupedTabs}
			groups={groups}
			activeId="b"
			onAdd={() => {}}
			onSelect={() => {}}
			onClose={() => {}}
			onMove={() => {}}
			onGroupCollapse={() => {}}
			onRenameGroup={() => {}}
			onRemoveGroup={() => {}}
			onSetTabGroup={() => {}}
			onCreateGroup={() => "new"}
		/>,
	);

	expect(html).toContain('aria-label="Reviews, 2 tabs"');
	expect(html).toContain('aria-expanded="true"');
	expect(html).toContain('aria-label="Later, 1 tab"');
	expect(html).toContain('aria-expanded="false"');
	expect(html).toContain('data-page-tab-id="b"');
	expect(html).not.toContain('data-page-tab-id="d"');
	expect(html).toContain('data-page-tab-id="c" aria-posinset="2" aria-setsize="4"');
});

test("a pinned tab keeps its full name in the accessible name and has no close button", () => {
	const pinned = [
		{ id: "home", title: "Needs you for the whole team", pinned: true },
		{ id: "tickets", title: "Tickets", pinned: false },
	];
	const html = renderToStaticMarkup(
		<PageTabs tabs={pinned} activeId="home" onAdd={() => {}} onSelect={() => {}} onClose={() => {}} onPin={() => {}} />,
	);

	expect(html).toContain('aria-label="Pinned: Needs you for the whole team"');
	expect(html).toContain('data-pinned="true"');
	expect(html).not.toContain('aria-label="Close Needs you for the whole team"');
	expect(html).toContain('aria-label="Close Tickets"');
	expect(html).toContain('aria-label="Tab actions"');
});

test("accepts the sort callback beside the other tab actions", () => {
	const html = renderToStaticMarkup(
		<PageTabs
			tabs={tabs}
			activeId="tickets"
			onAdd={() => {}}
			onSelect={() => {}}
			onClose={() => {}}
			onSort={() => {}}
		/>,
	);

	expect(html).toContain('aria-label="Tab actions"');
});

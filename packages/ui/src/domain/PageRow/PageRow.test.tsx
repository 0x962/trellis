import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageRow } from "./PageRow";

const render = (overrides: Partial<Parameters<typeof PageRow>[0]> = {}) =>
	renderToStaticMarkup(
		<PageRow
			title="Release report"
			summary="What ships in the next release."
			latestVersion={3}
			publishedBy="Agent"
			publishedAt="2026-09-24T20:00:00.000Z"
			age="2h"
			watcher="Page watcher"
			openThreadCount={2}
			pinned
			deleted={false}
			link={<a href="/p/TRL/pages/release-report" />}
			actions={[{ label: "Unpin", onSelect: () => {} }]}
			{...overrides}
		/>,
	);

test("shows the Page facts in stable row columns", () => {
	const html = render();

	expect(html).toContain("Release report");
	expect(html).toContain("What ships in the next release.");
	expect(html).toContain("v3");
	expect(html).toContain("Agent");
	expect(html).toContain("Page watcher");
	expect(html).toContain(">2</span>");
	expect(html).toContain("tabular");
});

test("gives keyboard focus to the title and the action menu", () => {
	const html = render();

	expect(html).toContain('href="/p/TRL/pages/release-report"');
	expect(html).toContain('aria-label="Actions for Release report"');
});

test("keeps empty facts and the deleted state explicit", () => {
	const html = render({ summary: "", watcher: null, openThreadCount: 0, pinned: false, deleted: true });

	expect(html).toContain("No summary");
	expect(html).toContain("No watcher");
	expect(html).toContain("Deleted");
	expect(html).not.toContain('aria-label="Pinned"');
});

test("shows the search project without the actions column", () => {
	const html = render({
		variant: "search",
		project: <span>TRL</span>,
		titleContent: <mark>Release</mark>,
		actions: [],
	});

	expect(html).toContain("<mark>Release</mark>");
	expect(html).toContain(">TRL</span>");
	expect(html).toContain("Page</span>");
	expect(html).not.toContain("Page actions");
});

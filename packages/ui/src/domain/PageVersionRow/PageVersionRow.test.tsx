import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageVersionRow } from "./PageVersionRow";

test("names a historical version and preserves its provenance", () => {
	const html = renderToStaticMarkup(
		<PageVersionRow
			number={3}
			label="Review"
			actor="Agent"
			sourcePath="reports/index.html"
			sha256={"a".repeat(64)}
			bytes={1234}
			publishedAt="2026-09-24T20:00:00Z"
			selected
			link={<a href="/p/TRL/pages/report?version=3" />}
		/>,
	);
	for (const text of [
		"Version 3: Review (selected)",
		"reports/index.html",
		"a".repeat(64),
		"1,234 bytes",
		"Agent",
		"?version=3",
	])
		expect(html).toContain(text);
});

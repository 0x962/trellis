import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { prRowHeight } from "../rowHeights";
import { columnVisibility } from "../utils/columnVisibility/columnVisibility";
import { PrRow } from "./PrRow";
import { prOf } from "./prOf";

const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

describe("PrRow", () => {
	test("prints only the number and title beside the state glyph", () => {
		const pr = prOf({
			title: "Show the pull request title",
			additions: 311,
			deletions: 12,
			changedFiles: 6,
			fail: 1,
			pending: 6,
			pass: 47,
			openThreads: 2,
		});
		const html = renderToStaticMarkup(<PrRow pr={pr} top={0} />);

		expect(textOf(html)).toBe("Pull request open#57080Show the pull request title");
		expect(html).toContain("Pull request open");
		expect(html).toContain("min-w-0 flex-1 truncate text-fg");
	});

	test("draws a wide ribbon that names the check counts", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({ fail: 1, pending: 6, pass: 47, skipped: 2 })} top={0} />);

		expect(html).toContain("w-48");
		expect(html).toContain('aria-label="56 checks: 1 failed, 6 pending, 47 passed, 2 skipped"');
	});

	test("the glyph carries the draft and merged states", () => {
		const draft = renderToStaticMarkup(<PrRow pr={prOf({ isDraft: true })} top={0} />);
		const merged = renderToStaticMarkup(<PrRow pr={prOf({ state: "merged", isDraft: true })} top={0} />);

		expect(draft).toContain("Pull request draft");
		expect(merged).toContain("Pull request merged");
	});

	test("takes the height and offset that the virtual list reserves", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({})} top={288} />);

		expect(html).toContain(`height:${prRowHeight}px`);
		expect(html).toContain("translateY(288px)");
	});

	test("starts under the ID column of the ticket row", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({})} top={0} />);

		expect(html).toContain("pl-19");
	});

	test("the epic route hides the pull request cell of the ticket row", () => {
		expect(columnVisibility(undefined, true, "epic").pr).toBe(false);
	});
});

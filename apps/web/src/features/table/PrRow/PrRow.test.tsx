import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { prRowHeight } from "../rowHeights";
import { PrRow } from "./PrRow";
import { prOf } from "./prOf";

// `renderToStaticMarkup` writes the text of each span with no separator, so
// the words of one line run together. The test reads the words, not the gaps.
const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

describe("PrRow", () => {
	test("prints the number and every cell of the pull request in order", () => {
		const pr = prOf({ additions: 311, deletions: 12, changedFiles: 6, fail: 1, pending: 6, pass: 47 });
		const html = textOf(renderToStaticMarkup(<PrRow pr={pr} top={0} />));

		expect(html).toContain("#57080");
		expect(html).toContain("open·311 lines added, 12 lines deleted+311−12·6 files·1 failed·6 pending·47 passed·agent");
	});

	test("draws the changed line counts with the shared element", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({ additions: 4735, deletions: 9 })} top={0} />);

		expect(html).toContain("4735 lines added, 9 lines deleted");
		expect(html).toContain('class="text-success">+4,735');
		expect(html).toContain('class="text-danger">−9');
	});

	test("leaves out a check bucket that counts zero", () => {
		const html = textOf(renderToStaticMarkup(<PrRow pr={prOf({ state: "merged", pass: 43 })} top={0} />));

		expect(html).toContain("merged·43 passed");
		expect(html).not.toContain("0 failed");
		expect(html).not.toContain("pending");
	});

	test("prints the state alone when the pull request has no check", () => {
		expect(textOf(renderToStaticMarkup(<PrRow pr={prOf({ state: "merged" })} top={0} />))).toContain("merged");
	});

	test("an open draft reads as a draft", () => {
		const html = textOf(renderToStaticMarkup(<PrRow pr={prOf({ isDraft: true })} top={0} />));

		expect(html).toContain("draft");
		expect(html).toContain("Pull request draft");
	});

	test("a merged pull request that was a draft reads as merged", () => {
		const html = textOf(renderToStaticMarkup(<PrRow pr={prOf({ state: "merged", isDraft: true })} top={0} />));

		expect(html).toContain("merged");
		expect(html).toContain("Pull request merged");
	});

	test("draws the failed count in the danger color", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({ fail: 2, pass: 8 })} top={0} />);

		expect(html).toContain('class="shrink-0 tabular text-danger">2 failed');
	});

	test("draws the turn of the person in the foreground color", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({ pass: 43 })} top={0} />);

		expect(html).toContain('class="shrink-0 tabular text-fg">you');
	});

	test("takes the height the virtual list reserves, at the offset it names", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({})} top={288} />);

		expect(html).toContain(`height:${prRowHeight}px`);
		expect(html).toContain("translateY(288px)");
	});
});

import { describe, expect, test } from "bun:test";
import type { TicketPr } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { prRowHeight } from "../rowHeights";
import { PrRow } from "./PrRow";

const prOf = (fields: Partial<TicketPr>) =>
	({
		number: 57080,
		owner: "0x962",
		repo: "trellis",
		state: "open",
		isDraft: false,
		pass: 0,
		fail: 0,
		pending: 0,
		skipped: 0,
		...fields,
	}) as TicketPr;

// `renderToStaticMarkup` writes the text of each span with no separator, so
// the words of one line run together. The test reads the words, not the gaps.
const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

describe("PrRow", () => {
	test("prints the number, the state and the check counts in order", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({ fail: 1, pending: 6, pass: 47 })} top={0} />);

		expect(textOf(html)).toContain("#57080");
		expect(textOf(html)).toContain("open·1 failed·6 pending·47 passed");
	});

	test("leaves out a check bucket that counts zero", () => {
		const html = textOf(renderToStaticMarkup(<PrRow pr={prOf({ state: "merged", pass: 43 })} top={0} />));

		expect(html).toContain("merged·43 passed");
		expect(html).not.toContain("0 failed");
		expect(html).not.toContain("pending");
	});

	test("prints the state alone when the pull request has no check", () => {
		expect(textOf(renderToStaticMarkup(<PrRow pr={prOf({})} top={0} />))).toContain("open");
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

		expect(html).toContain('class="shrink-0 text-danger">2 failed');
	});

	test("takes the height the virtual list reserves, at the offset it names", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({})} top={288} />);

		expect(html).toContain(`height:${prRowHeight}px`);
		expect(html).toContain("translateY(288px)");
	});
});

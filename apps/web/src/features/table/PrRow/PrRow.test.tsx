import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { prRowHeight } from "../rowHeights";
import { elbowRadius } from "../TreeLines";
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
		const html = renderToStaticMarkup(<PrRow pr={pr} top={0} last={false} hasChildLines={false} />);

		expect(textOf(html)).toBe("#57080Show the pull request title");
		expect(html).toContain("Pull request open");
		expect(html).toContain("min-w-0 flex-1 truncate text-fg");
	});

	test("gives the number a fixed width and tabular digits", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({ number: 129 })} top={0} last={false} hasChildLines={false} />);

		expect(html).toContain('class="w-14 shrink-0 text-fg tabular"');
	});

	test("draws the verdict mark after the title, so a mark never moves a title", () => {
		const html = renderToStaticMarkup(
			<PrRow pr={prOf({ verdict: "approved" })} top={0} last={false} hasChildLines={false} />,
		);

		expect(html).toContain('data-review-state="approved"');
		expect(html.indexOf('data-review-state="approved"')).toBeGreaterThan(html.indexOf("Show the pull request title"));
	});

	test("a pull request with no verdict draws no mark", () => {
		const html = renderToStaticMarkup(
			<PrRow pr={prOf({ verdict: null })} top={0} last={false} hasChildLines={false} />,
		);

		expect(html).not.toContain("data-review-state");
	});

	test("names the verdict in the words of the person who gave it", () => {
		const approved = renderToStaticMarkup(
			<PrRow pr={prOf({ verdict: "approved" })} top={0} last={false} hasChildLines={false} />,
		);
		const changes = renderToStaticMarkup(
			<PrRow pr={prOf({ verdict: "changes_requested" })} top={0} last={false} hasChildLines={false} />,
		);

		expect(approved).toContain("You approved this commit");
		expect(changes).toContain("You asked for changes");
	});

	test("draws a wide ribbon that names the check counts", () => {
		const html = renderToStaticMarkup(
			<PrRow pr={prOf({ fail: 1, pending: 6, pass: 47, skipped: 2 })} top={0} last={false} hasChildLines={false} />,
		);

		expect(html).toContain("w-48");
		expect(html).toContain("h-3");
		expect(html).toContain('aria-label="56 checks: 1 failed, 6 pending, 47 passed, 2 skipped"');
	});

	test("the glyph carries the draft, queued, and merged states", () => {
		const draft = renderToStaticMarkup(
			<PrRow pr={prOf({ isDraft: true })} top={0} last={false} hasChildLines={false} />,
		);
		const queued = renderToStaticMarkup(
			<PrRow pr={prOf({ isQueued: true })} top={0} last={false} hasChildLines={false} />,
		);
		const merged = renderToStaticMarkup(
			<PrRow pr={prOf({ state: "merged", isDraft: true })} top={0} last={false} hasChildLines={false} />,
		);

		expect(draft).toContain("Pull request draft");
		expect(queued).toContain("Pull request queued");
		expect(merged).toContain("Pull request merged");
	});

	test("takes the height and offset that the virtual list reserves", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({})} top={288} last={false} hasChildLines={false} />);

		expect(html).toContain(`height:${prRowHeight}px`);
		expect(html).toContain("translateY(288px)");
	});

	test("starts under the ID column of the ticket row", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({})} top={0} last={false} hasChildLines={false} />);

		expect(html).toContain("pl-19");
	});

	test("a middle child runs the tree rule through its full height and draws no border", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({})} top={0} last={false} hasChildLines={false} />);

		expect(html).toContain("left-[58px]");
		expect(html).toContain("bottom-0");
		expect(html).toContain(`top:${prRowHeight / 2 - elbowRadius}px`);
		expect(html).toContain("rounded-bl-sm");
		expect(html).not.toContain("border-b border-border");
	});

	test("the pull request the agent line hangs from runs a rule of its own to its bottom edge", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({})} top={0} last hasChildLines />);

		expect(html).toContain("left-[84px]");
		expect(html).toContain("top-[calc(50%+9px)]");
	});

	test("the pull request the agent line hangs from leaves the border of the group to that line", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({})} top={0} last hasChildLines />);

		expect(html).not.toContain("border-b border-border");
	});

	test("the last child ends the rule at the elbow and draws the border of the group", () => {
		const html = renderToStaticMarkup(<PrRow pr={prOf({})} top={0} last hasChildLines={false} />);

		expect(html).toContain(`height:${prRowHeight / 2 - elbowRadius}px`);
		expect(html).not.toContain("bottom-0");
		expect(html).toContain("border-b border-border");
	});

	test("the epic route hides the pull request cell of the ticket row", () => {
		expect(columnVisibility(undefined, true, "epic").pr).toBe(false);
	});
});

import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PrGlyph } from "./PrGlyph";

test("an open pull request draws the open glyph in the success color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" isQueued={false} readyForReview />);

	expect(html).toContain('data-pr-glyph="open"');
	expect(html).toContain("text-success");
	expect(html).toContain("Ready for review");
});

test("a queued pull request draws GitHub's merge queue glyph in the warning color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" isQueued readyForReview />);

	expect(html).toContain('data-pr-glyph="queued"');
	expect(html).toContain("text-warning");
	expect(html).toContain("Pull request queued");
});

test("a merged pull request draws the merged glyph in the agent color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="merged" isQueued={false} readyForReview />);

	expect(html).toContain('data-pr-glyph="merged"');
	expect(html).toContain("text-agent");
	expect(html).toContain("Pull request merged");
});

test("a closed pull request draws the closed glyph in the danger color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="closed" isQueued={false} readyForReview />);

	expect(html).toContain('data-pr-glyph="closed"');
	expect(html).toContain("text-danger");
	expect(html).toContain("Pull request closed");
});

test("the small glyph and the medium glyph draw the same state", () => {
	const small = renderToStaticMarkup(<PrGlyph state="open" isQueued={false} readyForReview size="sm" />);
	const medium = renderToStaticMarkup(<PrGlyph state="open" isQueued={false} readyForReview size="md" />);

	expect(small).toContain("size-4");
	expect(medium).toContain("size-4");
	expect(small).toContain('data-pr-glyph="open"');
	expect(medium).toContain('data-pr-glyph="open"');
});

test("an open pull request that is not ready for review draws the grey glyph", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" isQueued={false} readyForReview={false} />);

	expect(html).toContain('data-pr-glyph="not-ready"');
	expect(html).toContain("text-fg-muted");
	expect(html).toContain("Not ready for review");
});

test("the glyph names the first missing part", () => {
	const html = renderToStaticMarkup(
		<PrGlyph state="open" isQueued={false} readyForReview={false} reason="2 checks pending" />,
	);

	expect(html).toContain("Not ready for review: 2 checks pending");
});

test("a merged or closed pull request draws its state whatever it still needs", () => {
	const merged = renderToStaticMarkup(<PrGlyph state="merged" isQueued={false} readyForReview={false} />);
	const closed = renderToStaticMarkup(<PrGlyph state="closed" isQueued={false} readyForReview={false} />);

	expect(merged).toContain('data-pr-glyph="merged"');
	expect(closed).toContain('data-pr-glyph="closed"');
});

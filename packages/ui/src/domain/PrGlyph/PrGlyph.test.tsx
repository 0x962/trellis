import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PrGlyph } from "./PrGlyph";

test("a locally ready pull request draws the open glyph in blue", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" askedForReview />);

	expect(html).toContain('data-pr-glyph="open"');
	expect(html).toContain("text-label-blue");
	expect(html).toContain("Ready for review");
});

test("local approval turns the open glyph green with a distinct label", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" askedForReview locallyApproved />);
	expect(html).toContain('data-pr-glyph="approved"');
	expect(html).toContain("text-success");
	expect(html).toContain('aria-label="Locally approved"');
});

test("approval cannot replace the local ready mark", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" askedForReview={false} locallyApproved />);
	expect(html).toContain('data-pr-glyph="not-ready"');
	expect(html).toContain('aria-label="Not ready for review"');
	expect(html).not.toContain("text-success");
});

test("a merged pull request draws the merged glyph in the agent color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="merged" askedForReview />);

	expect(html).toContain('data-pr-glyph="merged"');
	expect(html).toContain("text-agent");
	expect(html).toContain("Pull request merged");
});

test("a closed pull request draws the closed glyph in the danger color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="closed" askedForReview />);

	expect(html).toContain('data-pr-glyph="closed"');
	expect(html).toContain("text-danger");
	expect(html).toContain("Pull request closed");
});

test("the small glyph and the medium glyph draw the same state", () => {
	const small = renderToStaticMarkup(<PrGlyph state="open" askedForReview size="sm" />);
	const medium = renderToStaticMarkup(<PrGlyph state="open" askedForReview size="md" />);

	expect(small).toContain("size-4");
	expect(medium).toContain("size-4");
	expect(small).toContain('data-pr-glyph="open"');
	expect(medium).toContain('data-pr-glyph="open"');
});

test("an open pull request that is not ready for review draws the grey glyph", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" askedForReview={false} />);

	expect(html).toContain('data-pr-glyph="not-ready"');
	expect(html).toContain("text-fg-muted");
	expect(html).toContain("Not ready for review");
});

test("a merged or closed pull request draws its state whatever it still needs", () => {
	const merged = renderToStaticMarkup(<PrGlyph state="merged" askedForReview={false} />);
	const closed = renderToStaticMarkup(<PrGlyph state="closed" askedForReview={false} />);

	expect(merged).toContain('data-pr-glyph="merged"');
	expect(closed).toContain('data-pr-glyph="closed"');
});

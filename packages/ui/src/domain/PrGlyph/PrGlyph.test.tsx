import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PrGlyph } from "./PrGlyph";

test("an open pull request draws the open glyph in the success color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" isQueued={false} localState="ready" />);

	expect(html).toContain('data-pr-glyph="open"');
	expect(html).toContain("text-success");
	expect(html).toContain("Ready for review");
});

test("a queued pull request draws GitHub's merge queue glyph in the warning color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" isQueued localState="ready" />);

	expect(html).toContain('data-pr-glyph="queued"');
	expect(html).toContain("text-warning");
	expect(html).toContain("Pull request queued");
});

test("a merged pull request draws the merged glyph in the agent color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="merged" isQueued={false} localState="ready" />);

	expect(html).toContain('data-pr-glyph="merged"');
	expect(html).toContain("text-agent");
	expect(html).toContain("Pull request merged");
});

test("a closed pull request draws the closed glyph in the danger color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="closed" isQueued={false} localState="ready" />);

	expect(html).toContain('data-pr-glyph="closed"');
	expect(html).toContain("text-danger");
	expect(html).toContain("Pull request closed");
});

test("the small glyph and the medium glyph draw the same state", () => {
	const small = renderToStaticMarkup(<PrGlyph state="open" isQueued={false} localState="ready" size="sm" />);
	const medium = renderToStaticMarkup(<PrGlyph state="open" isQueued={false} localState="ready" size="md" />);

	expect(small).toContain("size-4");
	expect(medium).toContain("size-4");
	expect(small).toContain('data-pr-glyph="open"');
	expect(medium).toContain('data-pr-glyph="open"');
});

test("an open pull request that the agent has not marked ready draws the draft glyph", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" isQueued={false} localState="draft" />);

	expect(html).toContain('data-pr-glyph="draft"');
	expect(html).toContain("text-fg-muted");
	expect(html).toContain("Draft: the agent has not asked for review");
});

test("a merged or closed pull request draws its state whatever the local state", () => {
	const merged = renderToStaticMarkup(<PrGlyph state="merged" isQueued={false} localState="draft" />);
	const closed = renderToStaticMarkup(<PrGlyph state="closed" isQueued={false} localState="draft" />);

	expect(merged).toContain('data-pr-glyph="merged"');
	expect(closed).toContain('data-pr-glyph="closed"');
});

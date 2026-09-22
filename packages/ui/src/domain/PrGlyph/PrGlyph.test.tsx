import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PrGlyph } from "./PrGlyph";

test("an open pull request draws the open glyph in the success color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" isDraft={false} isQueued={false} />);

	expect(html).toContain('data-pr-glyph="open"');
	expect(html).toContain("text-success");
	expect(html).toContain("Pull request open");
});

test("an open draft draws the draft glyph in the muted color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" isDraft={true} isQueued={false} />);

	expect(html).toContain('data-pr-glyph="draft"');
	expect(html).toContain("text-fg-muted");
	expect(html).toContain("Pull request draft");
});

test("a queued pull request draws GitHub's merge queue glyph in the warning color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" isDraft={false} isQueued />);

	expect(html).toContain('data-pr-glyph="queued"');
	expect(html).toContain("text-warning");
	expect(html).toContain("Pull request queued");
});

test("a merged pull request draws the merged glyph in the agent color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="merged" isDraft={false} isQueued={false} />);

	expect(html).toContain('data-pr-glyph="merged"');
	expect(html).toContain("text-agent");
	expect(html).toContain("Pull request merged");
});

test("a closed pull request draws the closed glyph in the danger color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="closed" isDraft={false} isQueued={false} />);

	expect(html).toContain('data-pr-glyph="closed"');
	expect(html).toContain("text-danger");
	expect(html).toContain("Pull request closed");
});

test("a merged pull request that carries the draft flag stays merged", () => {
	const html = renderToStaticMarkup(<PrGlyph state="merged" isDraft={true} isQueued={false} />);

	expect(html).toContain('data-pr-glyph="merged"');
});

test("the small glyph and the medium glyph draw the same state", () => {
	const small = renderToStaticMarkup(<PrGlyph state="open" isDraft={false} isQueued={false} size="sm" />);
	const medium = renderToStaticMarkup(<PrGlyph state="open" isDraft={false} isQueued={false} size="md" />);

	expect(small).toContain("size-4");
	expect(medium).toContain("size-4");
	expect(small).toContain('data-pr-glyph="open"');
	expect(medium).toContain('data-pr-glyph="open"');
});

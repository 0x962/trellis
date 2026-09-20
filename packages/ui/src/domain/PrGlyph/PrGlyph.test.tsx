import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PrGlyph, prGlyphLabel } from "./PrGlyph";

test("an open pull request draws the open glyph in the success color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" isDraft={false} />);

	expect(html).toContain('data-pr-glyph="open"');
	expect(html).toContain("text-success");
	expect(html).toContain("Pull request open");
});

test("an open draft draws the draft glyph in the muted color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="open" isDraft={true} />);

	expect(html).toContain('data-pr-glyph="draft"');
	expect(html).toContain("text-fg-muted");
	expect(html).toContain("Pull request draft");
});

test("a merged pull request draws the merged glyph in the agent color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="merged" isDraft={false} />);

	expect(html).toContain('data-pr-glyph="merged"');
	expect(html).toContain("text-agent");
	expect(html).toContain("Pull request merged");
});

test("a closed pull request draws the closed glyph in the danger color", () => {
	const html = renderToStaticMarkup(<PrGlyph state="closed" isDraft={false} />);

	expect(html).toContain('data-pr-glyph="closed"');
	expect(html).toContain("text-danger");
	expect(html).toContain("Pull request closed");
});

test("a merged pull request that carries the draft flag stays merged", () => {
	const html = renderToStaticMarkup(<PrGlyph state="merged" isDraft={true} />);

	expect(html).toContain('data-pr-glyph="merged"');
});

test("the small glyph and the medium glyph draw the same state", () => {
	const small = renderToStaticMarkup(<PrGlyph state="open" isDraft={false} size="sm" />);
	const medium = renderToStaticMarkup(<PrGlyph state="open" isDraft={false} size="md" />);

	expect(small).toContain("size-3.5");
	expect(medium).toContain("size-4");
	expect(small).toContain('data-pr-glyph="open"');
	expect(medium).toContain('data-pr-glyph="open"');
});

test("the label names the state of the pull request", () => {
	expect(prGlyphLabel("open", false)).toBe("Pull request open");
	expect(prGlyphLabel("open", true)).toBe("Pull request draft");
	expect(prGlyphLabel("merged", false)).toBe("Pull request merged");
	expect(prGlyphLabel("closed", false)).toBe("Pull request closed");
});

import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewReactions } from "./ReviewReactions";

const reactions = [
	{ reaction: "+1", author: "dana", kind: "comment" },
	{ reaction: "+1", author: "robin", kind: "comment" },
	{ reaction: "rocket", author: "robin", kind: "comment" },
];

test("draws the emoji GitHub uses for each reaction name", () => {
	const html = renderToStaticMarkup(
		<ReviewReactions reactions={reactions} actor="dana" busy={false} onReaction={() => {}} />,
	);

	expect(html).toContain("\u{1F44D}");
	expect(html).toContain("\u{1F680}");
	// The "Add reaction" button opens the picker and keeps its icon. Every
	// button before it is a count chip, and a count chip draws no icon.
	const chips = html.slice(0, html.indexOf('aria-label="Add reaction"'));
	expect(chips).not.toContain("<svg");
});

test("names the count button for a screen reader, not the emoji", () => {
	const html = renderToStaticMarkup(
		<ReviewReactions reactions={reactions} actor="dana" busy={false} onReaction={() => {}} />,
	);

	expect(html).toContain('aria-label="Agree (2)"');
	expect(html).toContain('aria-label="Launch (1)"');
	// The button hides its contents from the reader, so the reader says the
	// label and never the name of the emoji.
	expect(html).toContain('aria-hidden="true" class="inline-flex size-3.5');
});

test("draws a count button only for a reaction someone picked", () => {
	const html = renderToStaticMarkup(
		<ReviewReactions reactions={reactions} actor="dana" busy={false} onReaction={() => {}} />,
	);

	expect(html).not.toContain('aria-label="Love');
	expect(html).not.toContain("\u{2764}\u{FE0F}");
});

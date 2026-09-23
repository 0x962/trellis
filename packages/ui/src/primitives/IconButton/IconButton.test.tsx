import { expect, test } from "bun:test";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { renderToStaticMarkup } from "react-dom/server";
import { IconButton } from "./IconButton";

const markup = (processing: boolean) =>
	renderToStaticMarkup(<IconButton label="Resume session" icon={<ArrowsClockwise />} processing={processing} />);

test("draws the icon and takes a click while the action has not started", () => {
	const html = markup(false);

	expect(html).not.toContain("animate-spin");
	expect(html).not.toContain("disabled");
	expect(html).not.toContain("aria-busy");
});

test("draws a turning ring in the icon slot while the action runs", () => {
	const html = markup(true);

	expect(html).toContain("animate-spin");
	expect(html).toContain('aria-busy="true"');
	expect(html).toContain("disabled");
});

test("keeps the size of the button and of the icon slot while the action runs", () => {
	// The ring and the icon are both 14 px in a 28 px button, so the control
	// stays where it is.
	for (const html of [markup(false), markup(true)]) {
		expect(html).toContain("size-7");
		expect(html).toContain("size-3.5");
	}
});

test("keeps the name of the action while it runs", () => {
	expect(markup(true)).toContain('aria-label="Resume session"');
});

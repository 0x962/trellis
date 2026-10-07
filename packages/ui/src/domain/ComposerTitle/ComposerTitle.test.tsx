import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ComposerTitle } from "./ComposerTitle";

test("the composer variant preserves the shared textarea and its native props", () => {
	const html = renderToStaticMarkup(<ComposerTitle aria-label="Ticket title" defaultValue="Draft" disabled />);
	expect(html).toContain('data-variant="composer"');
	expect(html).toContain('class="ticket-composer-title"');
	expect(html).toContain('aria-label="Ticket title"');
	expect(html).toContain('rows="1"');
	expect(html).toContain('disabled=""');
	expect(html).toContain(">Draft</textarea>");
});

test("the document variant selects the shared document treatment", () => {
	const html = renderToStaticMarkup(<ComposerTitle variant="document" aria-label="Title" defaultValue="Document" />);
	expect(html).toContain('data-variant="document"');
	expect(html).toContain('class="ticket-composer-title"');
	expect(html).not.toContain(' variant="');
	expect(html).toContain(">Document</textarea>");
});

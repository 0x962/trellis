import { describe, expect, test } from "bun:test";
import { createMarkdownParser } from "./markdown";
import { safeHref } from "./sanitizeHtml";

const id = "01M3D3SJM6ZCR31JSN793PR52J";

describe("Trellis record links", () => {
	test("links bare resource addresses beside sentence punctuation", () => {
		const link = `trellis://resource/${id}`;
		const html = createMarkdownParser()(`Design: ${link}. Prototype: (${link});`);
		expect(html).toBe(`<p>Design: <a href="${link}">${link}</a>. Prototype: (<a href="${link}">${link}</a>);</p>\n`);
	});

	test("leaves code and invalid resource addresses unlinked", () => {
		const link = `trellis://resource/${id}`;
		const html = createMarkdownParser()(`\`${link}\` ${link}/extra ${link}?version=2 trellis://resource/missing`);
		expect(html).not.toContain("<a");
	});

	test("keeps a valid link in Markdown", () => {
		expect(createMarkdownParser()(`[Open the Page](trellis://page/${id})`)).toContain(
			`<a href="trellis://page/${id}">Open the Page</a>`,
		);
		expect(safeHref(`trellis://page/${id}`)).toBe(true);
	});

	test.each([
		`trellis://unknown/${id}`,
		"trellis://page/not-an-id",
		`trellis://page/${id}?version=2`,
		`trellis://page/${id}/extra`,
		` trellis://page/${id}`,
	])("refuses %s", (href) => {
		expect(safeHref(href)).toBe(false);
	});
});

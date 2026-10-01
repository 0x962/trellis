import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentContents } from "./DocumentContents";

const headings = [
	{ id: "first", level: 1, text: "Overview" },
	{ id: "second", level: 2, text: "Overview" },
	{ id: "third", level: 6, text: "日本語 <script>long heading</script>" },
];

test("duplicate labels retain separate targets and the selected heading", () => {
	const html = renderToStaticMarkup(<DocumentContents headings={headings} activeId="second" onSelect={() => {}} />);
	const buttons = html.match(/<button[^>]*>/g)!;
	expect(buttons[0]).toContain('data-heading-id="first"');
	expect(buttons[0]).not.toContain("aria-current");
	expect(buttons[1]).toContain('data-heading-id="second"');
	expect(buttons[1]).toContain('aria-current="location"');
});

test("visible rows preserve heading order, levels, and plain text", () => {
	const html = renderToStaticMarkup(<DocumentContents headings={headings} activeId={null} onSelect={() => {}} />);
	expect(html).toContain('aria-label="Document contents"');
	expect(html.indexOf("Overview")).toBeLessThan(html.indexOf("日本語"));
	for (const indent of [0, 3, 15]) expect(html).toContain(`padding-inline-start:calc(var(--spacing) * ${indent})`);
	expect(html).toContain("日本語 &lt;script&gt;long heading&lt;/script&gt;");
	expect(html).not.toContain("<script>");
});

test("large documents render a bounded window and retain the complete list size", () => {
	const many = Array.from({ length: 5_000 }, (_, index) => ({
		id: `heading-${index}`,
		level: 2,
		text: `Section ${index}`,
	}));
	const html = renderToStaticMarkup(<DocumentContents headings={many} activeId={null} onSelect={() => {}} />);
	expect(html.match(/<button/g)!.length).toBeLessThan(25);
	expect(html).toContain('aria-setsize="5000"');
	expect(html).toContain('aria-posinset="1"');
	expect(html.match(/tabindex="0"/g)).toHaveLength(1);
	expect(html).not.toContain("Section 4999");
});

test("loading, an empty document, and an empty heading have distinct labels", () => {
	const render = (value: typeof headings | null) =>
		renderToStaticMarkup(<DocumentContents headings={value} activeId={null} onSelect={() => {}} />);
	expect(render(null)).toContain('aria-busy="true"');
	expect(render(null)).toContain("Loading contents…");
	expect(render(null)).not.toContain("Add headings");
	expect(render([])).toContain("Add headings to show document contents.");
	expect(render([{ id: "empty", level: 3, text: "" }])).toContain("Untitled heading");
});

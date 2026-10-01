import { expect, test } from "bun:test";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "test-renderer";
import { DocumentContents } from "./DocumentContents";

const headings = [
	{ id: "first", level: 1, text: "Overview" },
	{ id: "second", level: 2, text: "Overview" },
	{ id: "third", level: 6, text: "日本語 <script>long heading</script>" },
];

test("duplicate labels select their own heading", async () => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	const selected: string[] = [];
	const root = createRoot();
	await act(async () => {
		root.render(<DocumentContents headings={headings} activeId="second" onSelect={(id) => selected.push(id)} />);
	});
	const buttons = root.container.queryAll((node) => node.type === "button");
	expect(buttons.map((button) => button.props["aria-current"])).toEqual([undefined, "location", undefined]);
	await act(async () => {
		buttons[0]!.props.onClick();
		buttons[1]!.props.onClick();
	});
	expect(selected).toEqual(["first", "second"]);
	await act(async () => root.unmount());
});

test("the full list preserves heading order, levels, and plain text", () => {
	const html = renderToStaticMarkup(<DocumentContents headings={headings} activeId={null} onSelect={() => {}} />);
	expect(html).toContain('aria-label="Document contents"');
	expect(html.indexOf("Overview")).toBeLessThan(html.indexOf("日本語"));
	for (const indent of [0, 3, 15]) expect(html).toContain(`padding-inline-start:calc(var(--spacing) * ${indent})`);
	expect(html).toContain("日本語 &lt;script&gt;long heading&lt;/script&gt;");
	expect(html).not.toContain("<script>");
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

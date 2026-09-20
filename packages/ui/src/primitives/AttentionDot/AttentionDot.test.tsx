import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AttentionDot } from "./AttentionDot";

test("draws the warning color when no tone is given", () => {
	const html = renderToStaticMarkup(<AttentionDot label="The agent asks a question." />);

	expect(html).toContain("bg-warning");
	expect(html).not.toContain("bg-danger");
});

test("draws the danger color for a failed run", () => {
	const html = renderToStaticMarkup(<AttentionDot label="The run failed." tone="danger" />);

	expect(html).toContain("bg-danger");
	expect(html).not.toContain("bg-warning");
});

test("gives a screen reader the label in place of the dot", () => {
	const html = renderToStaticMarkup(<AttentionDot label="The agent asks a question." />);

	expect(html).toContain('role="img"');
	expect(html).toContain('aria-label="The agent asks a question."');
});

test("takes the 6 px size of the mark table", () => {
	expect(renderToStaticMarkup(<AttentionDot label="The agent asks a question." />)).toContain("size-1.5");
});

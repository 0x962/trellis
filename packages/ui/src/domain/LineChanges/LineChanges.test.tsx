import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LineChanges } from "./LineChanges";

test("draws both counts and names them for a screen reader", () => {
	const html = renderToStaticMarkup(<LineChanges value={{ additions: 128, deletions: 34 }} pending={false} />);

	expect(html).toContain("+128");
	expect(html).toContain("−34");
	expect(html).toContain("128 lines added, 34 lines deleted");
});

test("draws an ellipsis on each side while the counts load", () => {
	const html = renderToStaticMarkup(<LineChanges value={null} pending />);

	expect(html).toContain("+…");
	expect(html).toContain("−…");
	expect(html).toContain("Line changes not ready");
});

test("draws nothing when the counts are not known and none is coming", () => {
	const html = renderToStaticMarkup(<LineChanges value={null} pending={false} />);

	expect(html).not.toContain("–");
	expect(html).not.toContain("…");
	expect(html).not.toContain("sr-only");
	expect(html).toContain("min-w-16");
	expect(html).toMatch(/><\/span>$/);
});

test("takes the width of its text when it draws nothing at the start alignment", () => {
	const html = renderToStaticMarkup(<LineChanges value={null} pending={false} align="start" />);

	expect(html).not.toContain("min-w-16");
});

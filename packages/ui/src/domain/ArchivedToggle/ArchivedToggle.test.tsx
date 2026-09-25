import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchivedToggle } from "./ArchivedToggle";

test("the archived toggle shows its controlled state and optional count", () => {
	const html = renderToStaticMarkup(
		<ArchivedToggle expanded onExpandedChange={() => undefined} semantics="expanded" count={1234} />,
	);

	expect(html).toContain('aria-expanded="true"');
	expect(html).not.toContain("aria-pressed");
	expect(html).toContain("Archived");
	expect(html).toContain(new Intl.NumberFormat().format(1234));
});

test("the archived toggle can select a list mode", () => {
	const html = renderToStaticMarkup(<ArchivedToggle expanded onExpandedChange={() => undefined} semantics="pressed" />);

	expect(html).toContain('aria-pressed="true"');
	expect(html).not.toContain("aria-expanded");
});

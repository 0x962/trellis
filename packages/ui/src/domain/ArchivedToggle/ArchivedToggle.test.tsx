import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ArchivedToggle } from "./ArchivedToggle";

test("the archived toggle shows its controlled state and optional count", () => {
	const html = renderToStaticMarkup(<ArchivedToggle expanded onExpandedChange={() => undefined} count={1234} />);

	expect(html).toContain('aria-expanded="true"');
	expect(html).toContain("Archived");
	expect(html).toContain(new Intl.NumberFormat().format(1234));
});

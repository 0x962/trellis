import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageTitle } from "./PageTitle";
import { TitleMenuButton } from "./TitleMenuButton";

test("a name that arrives as text is cut by the heading", () => {
	const html = renderToStaticMarkup(<PageTitle title="A page with a very long name" />);

	expect(html).toContain("truncate");
	expect(html).toContain("A page with a very long name");
});

// The trigger of a menu paints a hover fill and a focus outline around its
// text. A clip on the heading would cut that paint at the left edge.
test("a control keeps its own box, and the heading holds no clip", () => {
	const html = renderToStaticMarkup(<PageTitle title={<TitleMenuButton label="Sessions" />} />);

	expect(html).toContain("<h1");
	expect(html.slice(html.indexOf("<h1"), html.indexOf("<button"))).not.toContain("truncate");
});

test("the label inside the control is cut by the control", () => {
	const html = renderToStaticMarkup(<TitleMenuButton label="A section with a very long name" />);

	expect(html).toContain("truncate");
});

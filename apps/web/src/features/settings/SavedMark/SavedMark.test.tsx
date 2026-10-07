import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SavedMark } from "./SavedMark";

test("reduced motion removes the opacity transition", () => {
	const html = renderToStaticMarkup(<SavedMark savedAt={1} />);

	expect(html).toContain("transition-opacity");
	expect(html).toContain("motion-reduce:transition-none");
});

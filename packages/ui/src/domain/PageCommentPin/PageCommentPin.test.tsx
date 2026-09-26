import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageCommentPin } from "./PageCommentPin";

test("names an open Page comment pin with its thread details", () => {
	const html = renderToStaticMarkup(
		<PageCommentPin
			number={3}
			label='Comment 3, Navid, open, selected text "Revenue grew"'
			x={40}
			y={80}
			resolved={false}
			selected={false}
			onClick={() => {}}
		/>,
	);
	expect(html).toContain('aria-label="Comment 3, Navid, open, selected text &quot;Revenue grew&quot;"');
	expect(html).toContain('aria-pressed="false"');
	expect(html).toContain(">3<");
});

test("adds a visible state mark to a resolved pin", () => {
	const html = renderToStaticMarkup(
		<PageCommentPin
			number={2}
			label="Comment 2, Agent, resolved, element main"
			x={0}
			y={0}
			resolved
			selected
			onClick={() => {}}
		/>,
	);
	expect(html).toContain('aria-pressed="true"');
	expect(html).toContain("<svg");
});

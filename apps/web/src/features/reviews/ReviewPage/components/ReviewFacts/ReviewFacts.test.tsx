import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewFacts } from "./ReviewFacts";

test("shows a loading state until the merge conditions arrive", () => {
	const html = renderToStaticMarkup(
		<ReviewFacts ready={true} conditions={null}>
			<p>Facts</p>
		</ReviewFacts>,
	);

	expect(html).toContain('aria-busy="true"');
	expect(html).toContain("Merge conditions are loading.");
	expect(html).not.toContain("conditions unknown");
});

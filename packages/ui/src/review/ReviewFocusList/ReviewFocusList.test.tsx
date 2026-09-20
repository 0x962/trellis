import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewFocusList } from "./ReviewFocusList";

test("prints each sentence and the held count", () => {
	const html = renderToStaticMarkup(
		<ReviewFocusList
			sentences={[
				"the caller is an internal service identity",
				"the route names no property a caller did not ask about",
			]}
			held={[false, true]}
			onToggle={() => {}}
		/>,
	);

	expect(html).toContain("1 of 2 held");
	expect(html).toContain("the caller is an internal service identity");
	expect(html).toContain("the route names no property a caller did not ask about");
	expect(html).toContain("Held marks clear on each new revision.");
});

test("prints one faint line when the ticket names no focus", () => {
	const html = renderToStaticMarkup(<ReviewFocusList sentences={[]} held={[]} onToggle={() => {}} />);

	expect(html).toContain("0 of 0 held");
	expect(html).toContain("The ticket names no review focus.");
	expect(html).not.toContain("Held marks clear on each new revision.");
});

test("counts duplicate sentences as separate items", () => {
	const html = renderToStaticMarkup(
		<ReviewFocusList sentences={["check the route", "check the route"]} held={[true, false]} onToggle={() => {}} />,
	);

	expect(html).toContain("1 of 2 held");
});

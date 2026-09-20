import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { HoldMarksStorage } from "./holdMarks/holdMarks";
import { setHoldMark } from "./holdMarks/holdMarks";
import { ReviewFocusList } from "./ReviewFocusList";

const memoryStorage = (): HoldMarksStorage => {
	const values = new Map<string, string>();
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
	};
};

describe("ReviewFocusList", () => {
	test("prints each sentence and the held count", () => {
		const storage = memoryStorage();
		setHoldMark(
			storage,
			"0x962/trellis#162",
			{},
			"the route names no property a caller did not ask about",
			1,
			"revision-1",
			true,
		);

		const html = renderToStaticMarkup(
			<ReviewFocusList
				pr="0x962/trellis#162"
				revisionId="revision-1"
				sentences={[
					"the caller is an internal service identity",
					"the route names no property a caller did not ask about",
				]}
				storage={storage}
			/>,
		);

		expect(html).toContain("Review focus");
		expect(html).toContain("1 of 2 held");
		expect(html).toContain("the caller is an internal service identity");
		expect(html).toContain("the route names no property a caller did not ask about");
		expect(html).toContain("Held marks clear on each new revision.");
	});

	test("prints a sentence that the contract parser did not normalize", () => {
		const html = renderToStaticMarkup(
			<ReviewFocusList
				pr="0x962/trellis#162"
				revisionId="revision-1"
				sentences={["Review focus ??? apps/web/src/privateRoute.ts"]}
				storage={memoryStorage()}
			/>,
		);

		expect(html).toContain("Review focus ??? apps/web/src/privateRoute.ts");
	});

	test("prints one faint line when the ticket names no focus", () => {
		const html = renderToStaticMarkup(
			<ReviewFocusList pr="0x962/trellis#162" revisionId="revision-1" sentences={[]} storage={memoryStorage()} />,
		);

		expect(html).toContain("0 of 0 held");
		expect(html).toContain("The ticket names no review focus.");
		expect(html).not.toContain("Held marks clear on each new revision.");
	});
});

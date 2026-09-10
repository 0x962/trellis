import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { highlight } from "./highlight";

const marks = (text: string, query: string) => {
	const view = render(<p>{highlight(text, query)}</p>);
	const found = [...view.container.querySelectorAll("mark")].map((mark) => mark.textContent);
	view.unmount();
	return found;
};

describe("features/search/utils/highlight", () => {
	test("marks every word of the query, in any case", () => {
		expect(marks("OAuth client secret for the oauth app", "oauth secret")).toEqual(["OAuth", "secret", "oauth"]);
	});

	test("reads a regex character in the query as text", () => {
		expect(marks("Fix a+b in the parser", "a+b")).toEqual(["a+b"]);
	});

	test("an empty query marks nothing and keeps the text", () => {
		const view = render(<p>{highlight("Plain title", "  ")}</p>);
		expect(view.container.textContent).toBe("Plain title");
		expect(view.container.querySelectorAll("mark")).toHaveLength(0);
	});
});

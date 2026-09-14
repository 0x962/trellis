import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { LocalEvidence } from "./LocalEvidence";

test("a passed check from different contents remains out of date", () => {
	const view = render(
		<LocalEvidence
			readyForReview={false}
			artifacts={[]}
			checks={[
				{
					id: "check",
					command: "bun",
					args: ["test"],
					state: "passed",
					current: false,
					output: "4 tests pass",
					error: null,
					truncated: false,
				},
			]}
		/>,
	);
	expect(view.getByText("Out of date")).toBeDefined();
	expect(view.queryByText("Evidence ready for review")).toBeNull();
	expect(view.getByText("4 tests pass")).toBeDefined();
});

test("review evidence includes its registered files", () => {
	const view = render(
		<LocalEvidence
			readyForReview
			artifacts={[{ id: "artifact", path: "src/slug.ts", current: true }]}
			checks={[
				{
					id: "check",
					command: "bun",
					args: ["test"],
					state: "passed",
					current: true,
					output: "4 tests pass",
					error: null,
					truncated: false,
				},
			]}
		/>,
	);
	expect(view.getByText("Evidence ready for review")).toBeDefined();
	expect(view.getByText("src/slug.ts")).toBeDefined();
});

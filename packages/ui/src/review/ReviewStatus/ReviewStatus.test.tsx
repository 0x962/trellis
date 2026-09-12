import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { ReviewStatus } from "./ReviewStatus";

test.each([
	["open", "Open"],
	["closed", "Closed"],
	["merged", "Merged"],
	["DRAFT", "Draft"],
	["OPEN", "Open"],
])("review state %s displays %s", (state, label) => {
	const { container } = render(<ReviewStatus state={state} />);
	expect(container.textContent).toBe(label);
});

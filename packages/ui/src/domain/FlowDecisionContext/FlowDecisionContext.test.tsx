import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { FlowDecisionContext } from "./FlowDecisionContext";

test("a decision presents its instruction beside named completed output", () => {
	const view = render(
		<FlowDecisionContext
			title="Review the change"
			instruction="Compare the artifact with the check output."
			outputs={[
				{ key: "build:1", title: "Build", text: "The artifact is result.txt." },
				{ key: "check:1", title: "Check", text: "Five checks pass." },
			]}
		/>,
	);
	expect(view.getByRole("heading", { name: "Review the change" })).toBeDefined();
	expect(view.getByText("Compare the artifact with the check output.")).toBeDefined();
	expect(view.getByRole("region", { name: "Completed step output" }).textContent).toContain("Five checks pass.");
	expect(view.getByRole("heading", { name: "Build" }).parentElement!.textContent).toContain(
		"The artifact is result.txt.",
	);
});

test("a first decision shows its instruction without a completed output section", () => {
	const view = render(<FlowDecisionContext title="Approve" instruction="Read the request." outputs={[]} />);
	expect(view.getByText("Read the request.")).toBeDefined();
	expect(view.queryByRole("region", { name: "Completed step output" })).toBeNull();
});

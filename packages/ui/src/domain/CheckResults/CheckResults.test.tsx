import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { CheckResults } from "./CheckResults";

test("empty checks never imply success", () => {
	const view = render(<CheckResults groups={[]} />);
	expect(view.getByText("No pull request checks")).toBeDefined();
	expect(view.queryByText("Passed")).toBeNull();
});

test("check failures and source errors remain visible together", () => {
	const view = render(
		<CheckResults
			groups={[
				{
					id: "pr",
					title: "PR #2",
					error: "GitHub unavailable",
					checks: [{ name: "Unit tests", bucket: "fail", link: null }],
				},
			]}
		/>,
	);
	expect(view.getByText("Failed")).toBeDefined();
	expect(view.getByRole("alert").textContent).toContain("GitHub unavailable");
	expect(view.getByText("Unit tests")).toBeDefined();
});

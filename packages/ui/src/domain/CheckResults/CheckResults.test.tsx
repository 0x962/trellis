import { expect, spyOn, test } from "bun:test";
import { render, within } from "@testing-library/react";
import { CheckResults } from "./CheckResults";

test("empty checks never imply success", () => {
	const view = render(<CheckResults status="ready" pullRequests={[]} />);
	expect(view.getByText("No pull request checks")).toBeDefined();
	expect(view.queryByText("Passed")).toBeNull();
});

test("the pending query does not claim that the ticket has no pull request checks", () => {
	const view = render(<CheckResults status="pending" />);
	expect(view.getByRole("status").textContent).toContain("Load pull request checks");
	expect(view.queryByText("No pull request checks")).toBeNull();
});

test("the failed query shows its error instead of the no-checks state", () => {
	const view = render(<CheckResults status="error" error="The server did not answer." />);
	expect(view.getByRole("alert").textContent).toContain("The server did not answer.");
	expect(view.queryByText("No pull request checks")).toBeNull();
});

test("each linked pull request keeps its own section and empty state", () => {
	const view = render(
		<CheckResults
			status="ready"
			pullRequests={[
				{
					id: "web",
					pullRequestName: "acme/web #12",
					error: null,
					checks: [{ name: "Unit tests", bucket: "pass", link: "https://github.test/acme/web/checks/1" }],
				},
				{ id: "api", pullRequestName: "acme/api #7", error: null, checks: [] },
			]}
		/>,
	);
	const web = view.getByRole("region", { name: "acme/web #12" });
	const api = view.getByRole("region", { name: "acme/api #7" });
	expect(within(web).getByRole("link", { name: "Unit tests" }).getAttribute("href")).toBe(
		"https://github.test/acme/web/checks/1",
	);
	expect(within(api).getByText("GitHub reported no checks for this pull request.")).toBeDefined();
	expect(within(api).queryByRole("heading", { name: "No checks reported" })).toBeNull();
	expect(within(api).queryByText("Unit tests")).toBeNull();
});

test("linked pull request sections stay visible when GitHub reports no checks", () => {
	const view = render(
		<CheckResults
			status="ready"
			pullRequests={[
				{ id: "web", pullRequestName: "acme/web #12", error: null, checks: [] },
				{ id: "api", pullRequestName: "acme/api #7", error: null, checks: [] },
			]}
		/>,
	);
	expect(view.getByRole("region", { name: "acme/web #12" })).toBeDefined();
	expect(view.getByRole("region", { name: "acme/api #7" })).toBeDefined();
	expect(view.getAllByText("GitHub reported no checks for this pull request.")).toHaveLength(2);
	expect(view.queryByText("No pull request checks")).toBeNull();
});

test("check failures and source errors remain visible together", () => {
	const view = render(
		<CheckResults
			status="ready"
			pullRequests={[
				{
					id: "pr",
					pullRequestName: "PR #2",
					error: "GitHub unavailable",
					checks: [{ name: "Unit tests", bucket: "fail", link: null }],
				},
			]}
		/>,
	);
	const section = view.getByRole("region", { name: "PR #2" });
	expect(within(section).getByText("Failed")).toBeDefined();
	expect(within(section).getByRole("alert").textContent).toContain("GitHub unavailable");
	expect(within(section).getByText("Unit tests")).toBeDefined();
});

test("a pull request read error with no retained checks shows no empty claim", () => {
	const view = render(
		<CheckResults
			status="ready"
			pullRequests={[
				{
					id: "pr",
					pullRequestName: "PR #3",
					error: "GitHub unavailable",
					checks: [],
				},
			]}
		/>,
	);
	const section = view.getByRole("region", { name: "PR #3" });
	expect(within(section).getByRole("alert").textContent).toContain("GitHub unavailable");
	expect(within(section).queryByText("GitHub reported no checks for this pull request.")).toBeNull();
});

test("duplicate GitHub rows keep unique React keys", () => {
	const error = spyOn(console, "error").mockImplementation(() => {});
	try {
		render(
			<CheckResults
				status="ready"
				pullRequests={[
					{
						id: "pr",
						pullRequestName: "PR #4",
						error: null,
						checks: [
							{ name: "Unit tests", workflow: "CI", bucket: "pass", link: null },
							{ name: "Unit tests", workflow: "CI", bucket: "pass", link: null },
						],
					},
				]}
			/>,
		);
		expect(error).not.toHaveBeenCalled();
	} finally {
		error.mockRestore();
	}
});

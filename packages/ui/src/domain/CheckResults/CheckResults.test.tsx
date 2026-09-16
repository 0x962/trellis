import { expect, test } from "bun:test";
import { render, within } from "@testing-library/react";
import { CheckResults } from "./CheckResults";

test("empty checks never imply success", () => {
	const view = render(<CheckResults groups={[]} />);
	expect(view.getByText("No pull request checks")).toBeDefined();
	expect(view.queryByText("Passed")).toBeNull();
});

test("each linked pull request keeps its own section and empty state", () => {
	const view = render(
		<CheckResults
			groups={[
				{
					id: "web",
					title: "acme/web #12",
					error: null,
					checks: [{ name: "Unit tests", bucket: "pass", link: "https://github.test/acme/web/checks/1" }],
				},
				{ id: "api", title: "acme/api #7", error: null, checks: [] },
			]}
		/>,
	);
	const web = view.getByRole("region", { name: "acme/web #12" });
	const api = view.getByRole("region", { name: "acme/api #7" });
	expect(within(web).getByRole("link", { name: "Unit tests" }).getAttribute("href")).toBe(
		"https://github.test/acme/web/checks/1",
	);
	expect(within(api).getByText("No checks reported")).toBeDefined();
	expect(within(api).queryByText("Unit tests")).toBeNull();
});

test("linked pull request sections stay visible when GitHub reports no checks", () => {
	const view = render(
		<CheckResults
			groups={[
				{ id: "web", title: "acme/web #12", error: null, checks: [] },
				{ id: "api", title: "acme/api #7", error: null, checks: [] },
			]}
		/>,
	);
	expect(view.getByRole("region", { name: "acme/web #12" })).toBeDefined();
	expect(view.getByRole("region", { name: "acme/api #7" })).toBeDefined();
	expect(view.getAllByText("No checks reported")).toHaveLength(2);
	expect(view.queryByText("No pull request checks")).toBeNull();
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
	const section = view.getByRole("region", { name: "PR #2" });
	expect(within(section).getByText("Failed")).toBeDefined();
	expect(within(section).getByRole("alert").textContent).toContain("GitHub unavailable");
	expect(within(section).getByText("Unit tests")).toBeDefined();
});

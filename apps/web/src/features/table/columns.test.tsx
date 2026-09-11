import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor, within } from "@testing-library/react";
import { renderApp } from "../../../test/renderWithProviders";
import { ago, mountRow, summary } from "../../../test/row";
import { cellOf, findGrid, resetUi, rowOf, visibleColumns } from "../../../test/table";
import { tableViewport } from "../../../test/viewport";

const installViewport = tableViewport(800);

beforeEach(() => {
	resetUi();
	installViewport();
});

const minute = 60_000;

const namedColumns = () => visibleColumns().filter((column) => column !== "select");

const tabular = (cell: HTMLElement) =>
	[cell, ...cell.querySelectorAll("*")].some((element) => /\btabular\b/.test(element.className));

describe("features/table/columns", () => {
	// Outcome 22. TRL has no sub-project and no PR, and the default grouping
	// is by status, so the status, project, and PR columns do not repeat
	// what every row already shows.
	test("renders the default column set without the status, project, or PR column", async () => {
		renderApp({ path: "/p/TRL/table", actor: "navid" });
		await findGrid();
		await waitFor(() => expect(visibleColumns().length).toBeGreaterThan(0));
		expect(namedColumns()).toEqual(["priority", "id", "title", "actor", "updated"]);
	});

	// T2. Sort and columns live in Display, so the table has no header row.
	test("renders no column-header row", async () => {
		renderApp({ path: "/p/CDE/table", actor: "navid" });
		await findGrid();
		await waitFor(() => rowOf("CDE-47"));
		expect(document.querySelectorAll('[role="columnheader"]')).toHaveLength(0);
	});

	// T2. Across projects, the cell shows the key and the last path segment.
	test("shows the project key and the last path segment on /all", async () => {
		renderApp({ path: "/all/table?status=in-progress,agent-review,human-review", actor: "navid" });
		await findGrid();
		await waitFor(() => rowOf("CDE-42"));
		expect(within(cellOf("CDE-42", "project")).getByText("CDE")).toBeDefined();
		expect(within(cellOf("CDE-42", "project")).getByText("web")).toBeDefined();
		expect(cellOf("CDE-43", "project").textContent!.trim()).toBe("CDE");
	});

	// Outcome 23. CDE-43 sits in CDE itself, CDE-42 in CDE.web, CDE-45 in CDE.host.
	test("shows the project column with the relative sub-path when the scope includes sub-projects", async () => {
		renderApp({ path: "/p/CDE/table?status=in-progress,agent-review,human-review", actor: "navid" });
		await findGrid();
		await waitFor(() => rowOf("CDE-45"));
		expect(namedColumns()).toEqual(["priority", "id", "title", "pr", "project", "actor", "updated"]);
		expect(cellOf("CDE-42", "project").textContent!.trim()).toBe("web");
		expect(cellOf("CDE-45", "project").textContent!.trim()).toBe("host");
		expect(cellOf("CDE-43", "project").textContent!.trim()).toBe("");
	});

	// Outcome 24
	test("renders the parent chip, sub ring, clip count, and comment count after the title", () => {
		const { cell } = mountRow(
			summary({
				parent: { id: "01J8Z6X4Q3M2K1H0G9F8E7D6T2", identifier: "CDE-12" },
				childCount: 5,
				childDoneCount: 2,
				attachmentCount: 1,
				commentCount: 3,
			}),
		);
		const title = cell("title");
		expect(title.textContent!.indexOf(summary().title)).toBe(0);
		expect(within(title).getByLabelText("Parent CDE-12").textContent).toContain("CDE-12");
		expect(within(title).getByLabelText("2 of 5 sub-tickets done").textContent).toContain("2/5");
		expect(within(title).getByLabelText("1 attachment").textContent).toContain("1");
		expect(within(title).getByLabelText("3 comments").textContent).toContain("3");
	});

	// Outcome 25. The badge carries counts, so the mini ribbon draws one
	// segment per counted check.
	test("renders the PR state icon with a mini check ribbon", () => {
		const { cell } = mountRow(summary({ pr: { state: "open", ciState: "fail", pass: 3, fail: 1, pending: 0 } }));
		const pr = cell("pr");
		expect(within(pr).getByRole("img", { name: /open/i })).toBeDefined();
		const buckets = [...pr.querySelectorAll("[data-bucket]")].map((segment) => segment.getAttribute("data-bucket"));
		expect(buckets.filter((bucket) => bucket === "pass")).toHaveLength(3);
		expect(buckets.filter((bucket) => bucket === "fail")).toHaveLength(1);
		expect(buckets).toHaveLength(4);
	});

	// Outcome 26
	test("replaces the ribbon with a summary dot in compact density", () => {
		const { cell } = mountRow(
			summary({ pr: { state: "open", ciState: "fail", pass: 3, fail: 1, pending: 0 } }),
			"compact",
		);
		const pr = cell("pr");
		expect(pr.querySelectorAll("[data-bucket]")).toHaveLength(0);
		const dot = pr.querySelector("[data-ci-dot]");
		expect(dot).not.toBeNull();
		expect(dot!.getAttribute("data-ci-dot")).toBe("fail");
		expect(dot!.getAttribute("aria-label")).toMatch(/fail/i);
	});

	// Outcome 27
	test("renders the ID and the updated time with tabular numerals", () => {
		const agent = mountRow(
			summary({ lastActor: { kind: "agent", name: "claude-code", at: ago(9 * minute) }, updatedAt: ago(9 * minute) }),
		);
		expect(agent.cell("id").textContent).toContain("CDE-42");
		expect(tabular(agent.cell("id"))).toBe(true);
		expect(agent.cell("updated").textContent!.trim()).toBe("9m");
		expect(tabular(agent.cell("updated"))).toBe(true);
		expect(within(agent.cell("actor")).getByRole("img", { name: "claude-code · agent" })).toBeDefined();
		agent.unmount();
		const human = mountRow(summary({ lastActor: { kind: "human", name: "navid", at: ago(9 * minute) } }));
		expect(within(human.cell("actor")).getByRole("img", { name: "navid" }).textContent).toBe("N");
	});
});

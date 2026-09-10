import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { ticketSummary } from "../../../../../test/fixtures";
import { autoHide, columnVisibility } from "./columnVisibility";

const row = (overrides: Record<string, unknown> = {}) => ticketSummary(overrides) as TicketSummary;
const pr = { state: "open", ciState: "pass", pass: 1, fail: 0, pending: 0 };
const web = { id: "01J8Z6X4Q3M2K1H0G9F8E7D6W1", key: "CDE", path: "CDE.web", name: "web" };
const host = { id: "01J8Z6X4Q3M2K1H0G9F8E7D6H1", key: "CDE", path: "CDE.host", name: "host" };

const shown = (stored: Record<string, boolean> | undefined, group: string, rows: TicketSummary[]) =>
	autoHide(columnVisibility(stored, true), { group, rows });

describe("features/table/utils/columnVisibility", () => {
	test("grouping by status hides the status column, over a stored choice", () => {
		const rows = [row({ project: web }), row({ project: host })];
		expect(shown({ status: true }, "status", rows).status).toBe(false);
		expect(shown(undefined, "priority", rows).status).toBe(true);
	});

	test("grouping by project hides the project column", () => {
		const rows = [row({ project: web }), row({ project: host })];
		expect(shown({ project: true }, "project", rows).project).toBe(false);
		expect(shown(undefined, "status", rows).project).toBe(true);
	});

	test("rows that all share one project hide the project column", () => {
		expect(shown({ project: true }, "status", [row({ project: web }), row({ project: web })]).project).toBe(false);
	});

	test("the PR column shows only when a loaded row has a PR", () => {
		expect(shown({ pr: true }, "status", [row({ pr: null }), row({ pr: null })]).pr).toBe(false);
		expect(shown(undefined, "status", [row({ pr: null }), row({ pr })]).pr).toBe(true);
	});

	test("a column the person hid stays hidden", () => {
		expect(shown({ pr: false }, "status", [row({ pr })]).pr).toBe(false);
	});
});

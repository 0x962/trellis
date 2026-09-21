import { describe, expect, test } from "bun:test";
import type { TicketLabel, TicketSummary } from "@trellis/api";
import { autoHide, columnVisibility } from "./columnVisibility";

const row = (labels: TicketLabel[]) => ({ project: { id: "p1" }, pr: null, labels }) as unknown as TicketSummary;

const bug: TicketLabel = { id: "L1", name: "Bug", color: "red", group: null };

const visible = () => columnVisibility(undefined, true, "list");

describe("autoHide labels", () => {
	test("keeps the column when one loaded row holds a label", () => {
		const result = autoHide(visible(), { group: "none", rows: [row([]), row([bug])] });

		expect(result.labels).toBe(true);
	});

	test("hides the column when no loaded row holds a label", () => {
		const result = autoHide(visible(), { group: "none", rows: [row([]), row([])] });

		expect(result.labels).toBe(false);
	});

	test("hides the column while the list is empty", () => {
		expect(autoHide(visible(), { group: "none", rows: [] }).labels).toBe(false);
	});

	test("a hidden choice stays hidden even with a labelled row", () => {
		const stored = columnVisibility({ labels: false }, true, "list");

		expect(autoHide(stored, { group: "none", rows: [row([bug])] }).labels).toBe(false);
	});
});

describe("columnVisibility labels", () => {
	test("the column shows before any choice", () => {
		expect(visible().labels).toBe(true);
	});
});

describe("the columns of the epic route", () => {
	test("the epic route shows the waits column and the releases column", () => {
		const result = columnVisibility(undefined, true, "epic");

		expect(result.waits).toBe(true);
		expect(result.releases).toBe(true);
	});

	test("every other route hides both columns", () => {
		expect(visible().waits).toBe(false);
		expect(visible().releases).toBe(false);
	});

	test("a stored choice does not show a column the route hides", () => {
		const stored = columnVisibility({ waits: true, releases: true }, true, "list");

		expect(stored.waits).toBe(false);
		expect(stored.releases).toBe(false);
	});

	test("a stored choice hides a column the route shows", () => {
		const stored = columnVisibility({ waits: false }, true, "epic");

		expect(stored.waits).toBe(false);
		expect(stored.releases).toBe(true);
	});
});

describe("autoHide and the epic route", () => {
	test("keeps both columns, because neither repeats a grouping", () => {
		const epic = columnVisibility(undefined, true, "epic");
		const result = autoHide(epic, { group: "wave", rows: [row([])] });

		expect(result.waits).toBe(true);
		expect(result.releases).toBe(true);
	});

	test("keeps both columns while the list is empty", () => {
		const epic = columnVisibility(undefined, true, "epic");
		const result = autoHide(epic, { group: "wave", rows: [] });

		expect(result.waits).toBe(true);
		expect(result.releases).toBe(true);
	});
});

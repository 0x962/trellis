import { describe, expect, test } from "bun:test";
import type { TicketLabel, TicketSummary } from "@trellis/api";
import { autoHide, columnVisibility } from "./columnVisibility";

const row = (labels: TicketLabel[]) => ({ project: { id: "p1" }, pr: null, labels }) as unknown as TicketSummary;

const bug: TicketLabel = { id: "L1", name: "Bug", color: "red", group: null };

const visible = () => columnVisibility(undefined, true);

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
		const stored = columnVisibility({ labels: false }, true);

		expect(autoHide(stored, { group: "none", rows: [row([bug])] }).labels).toBe(false);
	});
});

describe("columnVisibility labels", () => {
	test("the column shows before any choice", () => {
		expect(visible().labels).toBe(true);
	});
});

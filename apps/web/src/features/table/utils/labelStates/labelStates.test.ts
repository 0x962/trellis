import { describe, expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { labelStates } from "./labelStates";

const bug = { id: "01LABELBUG0000000000000000", name: "bug" };
const web = { id: "01LABELWEB0000000000000000", name: "web" };
const docs = { id: "01LABELDOCS000000000000000", name: "docs" };

const ticket = (id: string, labels: { id: string; name: string }[]) => ({ id, labels }) as TicketSummary;

describe("labelStates", () => {
	test("a label every ticket holds is all, a label some hold is some", () => {
		const rows = [ticket("a", [bug, web]), ticket("b", [bug]), ticket("c", [bug, docs])];

		expect(labelStates(rows)).toEqual({ all: [bug.id], some: [web.id, docs.id] });
	});

	test("one ticket puts every label it holds in all", () => {
		expect(labelStates([ticket("a", [bug, web])])).toEqual({ all: [bug.id, web.id], some: [] });
	});

	test("no ticket holds no label", () => {
		expect(labelStates([])).toEqual({ all: [], some: [] });
	});

	test("a ticket with no label makes every label mixed", () => {
		const rows = [ticket("a", [bug]), ticket("b", [])];

		expect(labelStates(rows)).toEqual({ all: [], some: [bug.id] });
	});
});

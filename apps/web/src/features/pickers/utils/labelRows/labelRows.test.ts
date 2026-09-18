import { describe, expect, test } from "bun:test";
import type { Label, LabelGroup } from "@trellis/api";
import { createRowIdFor, labelRows } from "./labelRows";

const group = (id: string, name: string): LabelGroup => ({
	id,
	projectId: "root",
	name,
	createdAt: "2026-09-18T00:00:00.000Z",
	updatedAt: "2026-09-18T00:00:00.000Z",
});

const label = (id: string, name: string, groupId: string | null = null): Label => ({
	id,
	projectId: "root",
	groupId,
	name,
	color: "blue",
	description: "",
	ticketCount: 0,
	createdAt: "2026-09-18T00:00:00.000Z",
	updatedAt: "2026-09-18T00:00:00.000Z",
});

const groups = [group("g2", "Type"), group("g1", "Area")];
const labels = [label("l2", "urgent"), label("l1", "Bug"), label("l3", "Chore", "g2"), label("l4", "web", "g1")];

describe("labelRows", () => {
	test("puts the labels with no group first, and each group in name order", () => {
		const rows = labelRows(labels, groups, { checked: [], search: "" });
		expect(rows.items.map((item) => item.label)).toEqual(["Bug", "urgent"]);
		expect(rows.groups.map((section) => section.heading)).toEqual(["Area", "Type"]);
		expect(rows.groups[0]?.items.map((item) => item.label)).toEqual(["web"]);
	});

	test("checks the rows the ticket holds", () => {
		const rows = labelRows(labels, groups, { checked: ["l1", "l3"], search: "" });
		expect(rows.items.find((item) => item.id === "l1")?.checked).toBe(true);
		expect(rows.items.find((item) => item.id === "l2")?.checked).toBe(false);
		expect(rows.groups[1]?.items[0]?.checked).toBe(true);
	});

	test("matches a grouped label by its group name and its group/name form", () => {
		const rows = labelRows(labels, groups, { checked: [], search: "" });
		expect(rows.groups[1]?.items[0]?.keywords).toEqual(["Type", "Type/Chore"]);
	});

	test("leaves out a group with no label", () => {
		const rows = labelRows([label("l1", "Bug")], groups, { checked: [], search: "" });
		expect(rows.groups).toEqual([]);
	});

	test("offers the create row for a name the tree does not hold", () => {
		const rows = labelRows(labels, groups, { checked: [], search: " design " });
		const create = rows.groups.at(-1)?.items[0];
		expect(create?.id).toBe(createRowIdFor("design"));
		expect(create?.label).toBe('Create label "design"');
		// cmdk hides a row that the search text does not match, so the text is
		// a keyword of the row it typed.
		expect(create?.keywords).toEqual(["design"]);
	});

	test("offers no create row for an empty text, a held name, or a name the server refuses", () => {
		expect(labelRows(labels, groups, { checked: [], search: "  " }).groups).toHaveLength(2);
		expect(labelRows(labels, groups, { checked: [], search: "bug" }).groups).toHaveLength(2);
		expect(labelRows(labels, groups, { checked: [], search: "Type/Bug" }).groups).toHaveLength(2);
		expect(labelRows(labels, groups, { checked: [], search: "none" }).groups).toHaveLength(2);
	});
});

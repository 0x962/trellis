import { describe, expect, test } from "bun:test";
import type { Label, LabelGroup, TicketLabel } from "@trellis/api";
import { toggleLabel } from "./toggleLabel";

const stamp = "2026-09-18T00:00:00.000Z";

const group = (id: string, name: string): LabelGroup => ({
	id,
	projectId: "root",
	name,
	createdAt: stamp,
	updatedAt: stamp,
});

const label = (id: string, name: string, groupId: string | null = null): Label => ({
	id,
	projectId: "root",
	groupId,
	name,
	color: "blue",
	description: "",
	ticketCount: 0,
	createdAt: stamp,
	updatedAt: stamp,
});

const groups = [group("g1", "Type")];
const held = (id: string, name: string, groupName: string | null = null): TicketLabel => ({
	id,
	name,
	color: "blue",
	group: groupName,
});

describe("toggleLabel", () => {
	test("adds a label with no group", () => {
		expect(toggleLabel([], label("l1", "Bug"), groups, true)).toEqual([held("l1", "Bug")]);
	});

	test("removes the label the row unchecks", () => {
		const current = [held("l1", "Bug"), held("l2", "urgent")];
		expect(toggleLabel(current, label("l1", "Bug"), groups, false)).toEqual([held("l2", "urgent")]);
	});

	test("takes the other label of the group off the ticket", () => {
		const current = [held("l3", "Chore", "Type")];
		expect(toggleLabel(current, label("l4", "Bug", "g1"), groups, true)).toEqual([held("l4", "Bug", "Type")]);
	});

	test("keeps a label of another group", () => {
		const current = [held("l5", "web", "Area"), held("l1", "Bug")];
		const next = toggleLabel(current, label("l4", "Chore", "g1"), groups, true);
		expect(next.map((entry) => entry.id)).toEqual(["l1", "l5", "l4"]);
	});

	test("orders the labels with no group first, then by group name, then by name", () => {
		const current = [held("l6", "Zebra"), held("l7", "alpha"), held("l5", "web", "Area")];
		const next = toggleLabel(current, label("l4", "Chore", "g1"), groups, true);
		expect(next.map((entry) => entry.name)).toEqual(["alpha", "Zebra", "web", "Chore"]);
	});
});

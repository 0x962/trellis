import { describe, expect, test } from "bun:test";
import type { Label, LabelGroup } from "@trellis/api";
import { type LabelEntry, labelEntries } from "./labelEntries";

const label = (name: string, groupId: string | null = null) => ({ id: name, name, groupId }) as Label;

const group = (name: string) => ({ id: name, name }) as LabelGroup;

const names = (entries: LabelEntry[]) =>
	entries.map((entry) => (entry.kind === "label" ? entry.label.name : `${entry.group.name}/`));

const inside = (entries: LabelEntry[], groupName: string) => {
	const entry = entries.find((item) => item.kind === "group" && item.group.name === groupName)!;
	return entry.kind === "group" ? entry.labels.map((item) => item.name) : [];
};

describe("labelEntries", () => {
	test("sorts labels with no group and groups together, without regard to case", () => {
		const labels = [label("zeta"), label("Alpha"), label("bug", "Type")];
		const groups = [group("Type")];

		const entries = labelEntries(labels, groups, "");

		expect(names(entries)).toEqual(["Alpha", "Type/", "zeta"]);
	});

	test("puts the labels of a group in name order under the group", () => {
		const labels = [label("task", "Type"), label("bug", "Type")];

		const entries = labelEntries(labels, [group("Type")], "");

		expect(inside(entries, "Type")).toEqual(["bug", "task"]);
	});

	test("keeps a group whose label matches, and shows that label alone", () => {
		const labels = [label("bug", "Type"), label("task", "Type"), label("blocked")];

		const entries = labelEntries(labels, [group("Type")], "bu");

		expect(names(entries)).toEqual(["Type/"]);
		expect(inside(entries, "Type")).toEqual(["bug"]);
	});

	test("keeps every label of a group whose own name matches", () => {
		const labels = [label("bug", "Type"), label("task", "Type")];

		const entries = labelEntries(labels, [group("Type")], "typ");

		expect(inside(entries, "Type")).toEqual(["bug", "task"]);
	});

	test("drops a group that matches nothing", () => {
		const labels = [label("bug", "Type"), label("blocked")];

		const entries = labelEntries(labels, [group("Type")], "blo");

		expect(names(entries)).toEqual(["blocked"]);
	});
});

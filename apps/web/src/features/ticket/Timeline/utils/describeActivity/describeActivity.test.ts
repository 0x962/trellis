import { describe, expect, test } from "bun:test";
import type { Activity } from "@trellis/api";
import { describeActivity, describeRun } from "./describeActivity";

const row = (over: Partial<Activity>): Activity => ({
	id: 1,
	batchId: "01J000000000000000000000AA",
	rootId: "01J000000000000000000000BB",
	projectId: "01J000000000000000000000CC",
	ticketId: "01J000000000000000000000DD",
	actor: { kind: "human", name: "Nav" },
	action: "ticket.updated",
	field: null,
	fromValue: null,
	toValue: null,
	meta: {},
	createdAt: "2026-09-18T00:00:00.000Z",
	...over,
});

const labelRow = (from: string | null, to: string | null) =>
	row({ field: "labels", fromValue: from, toValue: to, meta: { color: "blue", group: null } });

describe("describeActivity for a label row", () => {
	test("names the label a write put on the ticket", () => {
		expect(describeActivity(labelRow(null, "Bug"))).toBe("added the label Bug");
	});

	test("names the label a write took off the ticket", () => {
		expect(describeActivity(labelRow("Bug", null))).toBe("removed the label Bug");
	});

	test("names both labels of a swap inside a group", () => {
		expect(describeActivity(labelRow("Type/Chore", "Type/Bug"))).toBe("changed the label from Type/Chore to Type/Bug");
	});
});

describe("describeActivity for a milestone row", () => {
	test("names the milestone a write put the ticket in", () => {
		const item = row({ field: "milestone", toValue: "OP/routine-runtime/phase-1" });
		expect(describeActivity(item)).toBe("put the ticket in the wave OP/routine-runtime/phase-1");
	});

	test("says the ticket left its milestone", () => {
		const item = row({ field: "milestone", fromValue: "OP/routine-runtime/phase-1" });
		expect(describeActivity(item)).toBe("removed the ticket from its wave");
	});
});

describe("describeRun with label rows", () => {
	test("merges the label rows and the status row into one phrase", () => {
		const items = [
			row({ field: "status", fromValue: "Todo", toValue: "In Progress" }),
			labelRow(null, "Bug"),
			labelRow(null, "Type/Chore"),
		];
		expect(describeRun(items)).toBe("changed the status and labels");
	});

	test("keeps a row with its own verb phrase beside the field list", () => {
		const items = [labelRow(null, "Bug"), row({ action: "comment.deleted" })];
		expect(describeRun(items)).toBe("changed the labels, and deleted a comment");
	});
});

import { describe, expect, test } from "bun:test";
import type { Activity } from "@trellis/api";
import { describeActivity, describeRun } from "./describeActivity";

// An activity row as the server writes it: the create of a ticket carries
// the action `ticket.created` and no field.
const row = (overrides: Partial<Activity>): Activity => ({
	id: 1,
	batchId: "01J9ZK3Q8V2M4N6P7R8S9T0V1W",
	rootId: "01J9ZK3Q8V2M4N6P7R8S9T0V1X",
	projectId: "01J9ZK3Q8V2M4N6P7R8S9T0V1Y",
	ticketId: "01J9ZK3Q8V2M4N6P7R8S9T0V1Z",
	actor: { kind: "human", name: "navid" },
	action: "ticket.updated",
	field: null,
	fromValue: null,
	toValue: null,
	meta: {},
	createdAt: "2026-09-09T12:00:00.000Z",
	...overrides,
});

// The server writes a PR link as `pr.linked` with no field and the URL in
// `meta` (services/pullRequests.ts).
const linked = row({
	action: "pr.linked",
	meta: { pullRequestId: "01J9ZK3Q8V2M4N6P7R8S9T0V20", url: "https://github.com/acme/web/pull/118" },
});

describe("features/ticket/Timeline/utils/describeActivity", () => {
	test("the server's create row reads as created the ticket", () => {
		expect(describeActivity(row({ action: "ticket.created" }))).toBe("created the ticket");
	});

	test("an update row names its field", () => {
		expect(describeActivity(row({ field: "title" }))).toBe("renamed the ticket");
		expect(describeActivity(row({ field: "description" }))).toBe("edited the description");
		expect(describeActivity(row({ field: "status", fromValue: "Todo", toValue: "In Progress" }))).toBe(
			"moved the ticket from Todo to In Progress",
		);
		expect(describeActivity(row({ field: "priority", fromValue: "none", toValue: "high" }))).toBe(
			"set the priority to High",
		);
		expect(describeActivity(row({ field: "parent", toValue: "CDE-43" }))).toBe("set the parent to CDE-43");
		expect(describeActivity(row({ field: "parent", fromValue: "CDE-43", toValue: null }))).toBe("removed the parent");
		expect(describeActivity(row({ field: "project", fromValue: "CDE.web", toValue: "CDE.desktop" }))).toBe(
			"moved the ticket to CDE/desktop",
		);
		expect(describeActivity(row({ field: "position", fromValue: "1", toValue: "2" }))).toBe(
			"moved the ticket in the column",
		);
	});

	// TK-1. These rows carry no field, so the action names what happened.
	test("a PR, attachment, or comment row reads from its action", () => {
		expect(describeActivity(linked)).toBe("linked the PR web #118");
		expect(describeActivity({ ...linked, action: "pr.unlinked" })).toBe("removed the PR web #118");
		expect(
			describeActivity(row({ action: "attachment.created", meta: { filename: "trace.zip", attachmentId: "x" } })),
		).toBe("attached trace.zip");
		expect(
			describeActivity(row({ action: "attachment.deleted", meta: { filename: "trace.zip", attachmentId: "x" } })),
		).toBe("removed trace.zip");
		expect(describeActivity(row({ action: "comment.updated", meta: { commentId: "x" } }))).toBe("edited a comment");
		expect(describeActivity(row({ action: "comment.deleted", meta: { commentId: "x" } }))).toBe("deleted a comment");
		expect(
			describeActivity(row({ action: "status.remapped", field: "status", fromValue: "QA", toValue: "Todo" })),
		).toBe("moved the ticket from QA to Todo");
	});

	test("an unknown field keeps the article", () => {
		expect(describeActivity(row({ field: "estimate" }))).toBe("changed the estimate");
		expect(describeActivity(row({ action: "ticket.something" }))).toBe("changed the ticket");
	});

	test("a run joins its fields, then its PR links", () => {
		const status = row({ field: "status", fromValue: "Todo", toValue: "In Progress" });
		const priority = row({ field: "priority", fromValue: "medium", toValue: "high" });
		expect(describeRun([status, priority, linked])).toBe("changed the status and priority, and linked the PR web #118");
		expect(describeRun([status, priority])).toBe("changed the status and priority");
		expect(describeRun([linked, { ...linked, meta: { url: "https://github.com/acme/api/pull/7" } }])).toBe(
			"linked the PR web #118 and linked the PR api #7",
		);
	});
});

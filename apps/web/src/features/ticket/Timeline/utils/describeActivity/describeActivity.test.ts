import { describe, expect, test } from "bun:test";
import type { Activity } from "@trellis/api";
import { describeActivity } from "./describeActivity";

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

describe("features/ticket/Timeline/utils/describeActivity", () => {
	test("the server's create row reads as created the ticket", () => {
		expect(describeActivity(row({ action: "ticket.created" }))).toBe("created the ticket");
	});

	test("an update row names its field", () => {
		expect(describeActivity(row({ field: "title" }))).toBe("renamed the ticket");
	});
});

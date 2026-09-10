import { describe, expect, test } from "bun:test";
import { TimelineListOutputSchema } from "@trellis/api";
import { createFakeServer } from "./index";

describe("fake server timeline", () => {
	// WS-126. CDE-42 carries 4 comments and the activity rows the reference screens
	// timeline shows: created, two status moves, and a change batch.
	test("timeline.list merges comments and activity newest first with paging", async () => {
		const server = createFakeServer();
		const all = TimelineListOutputSchema.parse(await server.client.timeline.list({ ticket: "CDE-42" }));
		expect(all.nextCursor).toBeNull();
		const kinds = new Set(all.items.map((item) => item.kind));
		expect(kinds).toEqual(new Set(["comment", "activity"]));
		expect(all.items.filter((item) => item.kind === "comment")).toHaveLength(4);
		expect(all.items.filter((item) => item.kind === "activity").length).toBeGreaterThanOrEqual(4);
		const stamps = all.items.map((item) => item.createdAt);
		expect(stamps).toEqual([...stamps].sort().reverse());
		const ticket = await server.client.tickets.get({ ticket: "CDE-42" });
		expect(all.items.every((item) => item.ticketId === ticket.id)).toBe(true);
		const actions = all.items.filter((item) => item.kind === "activity").map((item) => item.action);
		expect(actions).toContain("created");
		expect(all.items.some((item) => item.kind === "activity" && item.field === "status")).toBe(true);

		const first = TimelineListOutputSchema.parse(await server.client.timeline.list({ ticket: "CDE-42", limit: 4 }));
		expect(first.items).toHaveLength(4);
		expect(first.nextCursor).toBeString();
		const second = TimelineListOutputSchema.parse(
			await server.client.timeline.list({ ticket: "CDE-42", limit: 4, before: first.nextCursor! }),
		);
		expect(second.items.length).toBeGreaterThan(0);
		const key = (item: { kind: string; id: string | number }) => `${item.kind}:${item.id}`;
		expect([...first.items, ...second.items].map(key)).toEqual(all.items.slice(0, 4 + second.items.length).map(key));
	});
});

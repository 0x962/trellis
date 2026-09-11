import { describe, expect, test } from "bun:test";
import { InboxSchema } from "@trellis/api";
import { createFakeServer } from "./index";

const dayMs = 24 * 60 * 60 * 1000;

describe("fake server inbox", () => {
	// WS-127. Review lists human-reviewer tickets, oldest waiting first.
	// Stalled is a started ticket with no activity for settings.stalledHours.
	// Done by agents today is a done ticket an agent completed in the last
	// 24 hours.
	test("inbox.get returns the seeded section totals and honors project", async () => {
		const server = createFakeServer();
		const inbox = InboxSchema.parse(await server.client.inbox.get({}));
		expect(inbox.review.total).toBe(3);
		expect(inbox.review.items.map((item) => item.identifier)).toEqual(["CDE-42", "CDE-37", "TRL-9"]);
		expect(inbox.review.items.every((item) => item.status.reviewer === "human")).toBe(true);
		expect(inbox.failingCi.total).toBe(1);
		expect(inbox.failingCi.items.map((item) => item.identifier)).toEqual(["CDE-44"]);
		expect(inbox.stalled.total).toBe(1);
		expect(inbox.stalled.items.map((item) => item.identifier)).toEqual(["CDE-38"]);
		const settings = await server.client.settings.get();
		const threshold = Date.now() - settings.stalledHours * 60 * 60 * 1000;
		expect(new Date(inbox.stalled.items[0]!.updatedAt).getTime()).toBeLessThan(threshold);
		expect(inbox.doneByAgentsToday.total).toBe(6);
		expect(inbox.doneByAgentsToday.items).toHaveLength(6);
		for (const item of inbox.doneByAgentsToday.items) {
			expect(item.status.category).toBe("done");
			expect(item.lastActor?.kind).toBe("agent");
			expect(Date.now() - new Date(item.completedAt!).getTime()).toBeLessThan(dayMs);
		}
		expect(inbox.doneByAgentsToday.items.map((item) => item.identifier)).toContain("CDE-48");
		expect(inbox.doneByAgentsToday.items.map((item) => item.identifier)).toContain("CDE-49");

		const trl = InboxSchema.parse(await server.client.inbox.get({ project: "TRL" }));
		expect(trl.review.items.map((item) => item.identifier)).toEqual(["TRL-9"]);
		expect(trl.failingCi.total).toBe(0);
		expect(trl.stalled.total).toBe(0);
		expect(trl.doneByAgentsToday.total).toBe(2);
		expect(trl.doneByAgentsToday.items.every((item) => item.project.key === "TRL")).toBe(true);
	});
});

import { describe, expect, test } from "@jest/globals";
import { prUrl, reset, seedAttachment, seedComment, seedPr, seedProject, seedTicket } from "../../../test/seed";
import { human, seeder } from "../../../test/server";
import { timelineRows } from "./timelineRows";

// The rows the ticket screen draws, built from the timeline the server
// answers. Every activity row the server writes carries a field or an
// action; a row the app cannot name reads "changed null" on the phone.

const labels = async (ticket: string) => {
	const page = await human.timeline.list({ ticket });
	return timelineRows(page.items).flatMap((row) => (row.kind === "activity" ? [row.label] : []));
};

describe("the timeline rows of a real ticket", () => {
	test("names every activity the server writes", async () => {
		await reset(seeder);
		await seedProject(seeder, { key: "TML", name: "Timeline" });
		const ticket = await seedTicket(seeder, { project: "TML", title: "Name every timeline row" });
		const id = ticket.identifier;
		await seedAttachment(seeder, id, "shot.png");
		await seedPr(seeder, id, { number: 118, title: "Ship it", headRef: "feat", checks: [] });
		const root = await seedComment(seeder, id, "An agent note.", "agent");
		await human.comments.resolve({ id: root.id, resolved: true });
		await human.tickets.update({ ticket: id, priority: "high" });
		await human.tickets.move({ ticket: id, status: "in-progress" });

		const shown = await labels(id);
		expect(shown.join(" | ")).not.toContain("null");
		const text = shown.join(" | ");
		expect(text).toContain("created the ticket");
		expect(text).toContain("attached shot.png");
		expect(text).toContain(`linked PR web #118`);
		expect(text).toContain("resolved a comment thread");
		expect(text).toContain("priority");
		expect(text).toContain("status");
		expect(prUrl(118)).toContain("/pull/118");
	});

	// The comment card shows the comment, so its `comment.created` row draws
	// no second line.
	test("draws one row per comment and no bare line beside it", async () => {
		await reset(seeder);
		await seedProject(seeder, { key: "TMC", name: "Comments" });
		const ticket = await seedTicket(seeder, { project: "TMC", title: "One row per comment" });
		const id = ticket.identifier;
		await seedComment(seeder, id, "The first note.");
		await seedComment(seeder, id, "The second note.", "agent");

		const page = await human.timeline.list({ ticket: id });
		expect(page.items.filter((item) => item.kind === "activity" && item.action === "comment.created")).toHaveLength(2);
		const rows = timelineRows(page.items);
		expect(rows.filter((row) => row.kind === "comment")).toHaveLength(2);
		// The create row of the ticket is the only activity row left.
		const activity = rows.filter((row) => row.kind === "activity");
		expect(activity).toHaveLength(1);
		expect(activity[0]!.kind === "activity" && activity[0]!.label).toBe("created the ticket");
	});
});

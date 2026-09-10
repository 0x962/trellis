import { describe, expect, test } from "bun:test";
import type { Status, StatusCategory } from "@trellis/api";
import { targetStatus } from "./targetStatus";

const projectId = "01J8Z6X4Q3M2K1H0G9F8E7D6P1";

const status = (name: string, category: StatusCategory, position: number): Status => ({
	id: `01J8Z6X4Q3M2K1H0G9F8E7D6S${position}`,
	slug: name.toLowerCase().replace(/ /g, "-"),
	name,
	category,
	reviewer: category === "review" ? "human" : null,
	color: "fg-muted",
	projectId,
	description: "",
	position,
	wipLimit: null,
	isDefault: false,
	createdAt: "2026-09-01T00:00:00.000Z",
	updatedAt: "2026-09-01T00:00:00.000Z",
});

describe("targetStatus", () => {
	// NY-12. The list arrives in position order, and Archived sits after
	// Done, so an approval lands on Done.
	test("returns the lowest-position done status", () => {
		const statuses = [status("Done", "done", 5), status("Archived", "done", 6)];
		expect(targetStatus(statuses, "done").name).toBe("Done");
		expect(targetStatus([...statuses].reverse(), "done").name).toBe("Done");
	});

	// NY-13
	test("returns the lowest-position started and todo statuses", () => {
		const statuses = [
			status("Backlog", "todo", 1),
			status("Todo", "todo", 0),
			status("In Progress", "started", 2),
			status("In Review Build", "started", 3),
		];
		expect(targetStatus(statuses, "started").name).toBe("In Progress");
		expect(targetStatus(statuses, "todo").name).toBe("Todo");
	});
});

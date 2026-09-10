import { describe, expect, test } from "bun:test";
import type { Status } from "@trellis/api";
import { lowestPositionStatus } from "./statusPicks";

const status = (name: string, category: Status["category"], position: number): Status => ({
	id: `01J8Z6X4Q3M2K1H0G9F8E7D6${String(position).padStart(2, "0")}`,
	slug: name.toLowerCase().replace(/\s+/g, "-"),
	name,
	category,
	reviewer: category === "review" ? "human" : null,
	color: "fg-muted",
	projectId: "01J8Z6X4Q3M2K1H0G9F8E7D6P1",
	position,
	wipLimit: null,
	isDefault: position === 0,
	createdAt: "2026-09-09T10:00:00.000Z",
	updatedAt: "2026-09-09T10:00:00.000Z",
});

// The list arrives out of position order, so the pick cannot rely on it.
const statuses = [
	status("Done", "done", 6),
	status("In Progress", "started", 3),
	status("Todo", "todo", 0),
	status("Shipped", "done", 5),
	status("Human Review", "review", 4),
	status("Queued", "started", 2),
	status("Canceled", "canceled", 7),
];

describe("lib/statusPicks", () => {
	// WT-102
	test("picks the lowest-position status per category", () => {
		expect(lowestPositionStatus(statuses, "done")!.name).toBe("Shipped");
		expect(lowestPositionStatus(statuses, "started")!.name).toBe("Queued");
		expect(lowestPositionStatus(statuses, "todo")!.name).toBe("Todo");
	});
});

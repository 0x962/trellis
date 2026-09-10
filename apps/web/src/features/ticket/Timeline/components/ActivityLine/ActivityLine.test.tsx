import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { Activity } from "@trellis/api";
import { batchId, projectId, ticketId } from "../../../../../../test/fixtures";
import { ago, hour } from "../../../../../../test/ticketHost";
import { ActivityLine } from "./ActivityLine";

const moved: Activity = {
	id: 7,
	batchId,
	rootId: projectId,
	projectId,
	ticketId,
	actor: { name: "claude-code", kind: "agent" },
	action: "ticket.updated",
	field: "status",
	fromValue: "Todo",
	toValue: "In Progress",
	meta: {},
	createdAt: ago(2 * hour),
};

describe("features/ticket/Timeline/components/ActivityLine", () => {
	// WT-79. One 32 px line (h-8): the actor chip, the verb, from → to, the time.
	test("renders one activity as a 32 px line with from and to", () => {
		render(
			<ul>
				<ActivityLine item={moved} />
			</ul>,
		);
		const line = screen.getByRole("listitem");
		expect(line.className).toMatch(/\bh-8\b/);
		expect(line.getAttribute("data-kind")).toBe("activity");
		const text = line.textContent!.replace(/\s+/g, " ").trim();
		expect(text).toMatch(/^claude-code ?· ?agent moved Todo → In Progress/);
		expect(screen.getByRole("img", { name: "claude-code · agent" })).toBeDefined();
		const time = line.querySelector("time")!;
		expect(time.getAttribute("datetime")).toBe(moved.createdAt);
		expect(time.textContent).toBe("2h");
	});
});

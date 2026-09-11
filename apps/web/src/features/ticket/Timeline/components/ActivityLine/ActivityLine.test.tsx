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
	meta: { fromId: "a", toId: "b", fromCategory: "todo", toCategory: "started" },
	createdAt: ago(2 * hour),
};

describe("features/ticket/Timeline/components/ActivityLine", () => {
	// WT-79. One 32 px line (h-8): the actor chip, the verb, from and to, the time.
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
		expect(text).toMatch(/^claude-code moved the ticket from Todo to In Progress/);
		expect(screen.getByRole("img", { name: "claude-code · agent" })).toBeDefined();
		const time = line.querySelector("time")!;
		expect(time.getAttribute("datetime")).toBe(moved.createdAt);
		expect(time.textContent).toBe("2h");
	});

	// TK-2. Each status name has its icon and the color of its category, so
	// the eye finds the move without the words.
	test("a status move shows the icon and the category color of both statuses", () => {
		render(
			<ul>
				<ActivityLine item={moved} />
			</ul>,
		);
		const line = screen.getByRole("listitem");
		const icons = [...line.querySelectorAll("svg[data-category]")].map((icon) => icon.getAttribute("data-category"));
		expect(icons).toEqual(["todo", "started"]);
		expect(screen.getByText("In Progress").className).toMatch(/\btext-warning\b/);
		expect(line.className).toMatch(/\btext-sm\b/);
	});

	test("an agent reviewer status reads in the agent color", () => {
		const review: Activity = {
			...moved,
			toValue: "Agent Review",
			meta: { fromCategory: "started", toCategory: "review" },
		};
		render(
			<ul>
				<ActivityLine item={review} reviewer={(name) => (name === "Agent Review" ? "agent" : "human")} />
			</ul>,
		);
		expect(screen.getByText("Agent Review").className).toMatch(/\btext-agent\b/);
	});
});

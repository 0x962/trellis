import { beforeEach, describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Comment } from "@trellis/api";
import { ticketId } from "../../../../../../test/fixtures";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import { ago, hour } from "../../../../../../test/ticketHost";
import { CommentCard } from "./CommentCard";

beforeEach(() => localStorage.clear());

// Today at 22:52 local time.
const at2252 = () => {
	const date = new Date();
	date.setHours(22, 52, 0, 0);
	return date.toISOString();
};

const comment = (overrides: Partial<Comment>): Comment => ({
	id: "01J8Z6X4Q3M2K1H0G9F8E7D6C1",
	ticketId,
	body: "Merged upstream **1.27**. Every keep-marker survived.",
	actor: { name: "claude-code", kind: "agent" },
	createdAt: ago(hour),
	updatedAt: ago(hour),
	...overrides,
});

const mount = (rows: Comment[]) =>
	renderWithProviders(
		<ul>
			{rows.map((row) => (
				<CommentCard key={row.id} comment={row} />
			))}
		</ul>,
		{ path: "/t/CDE-42", actor: "navid" },
	);

describe("features/ticket/Timeline/components/CommentCard", () => {
	// WT-77. The relative time is the text; the absolute time is its title.
	test("renders a comment card with its actor, time, body, and menu", async () => {
		const user = userEvent.setup();
		const createdAt = at2252();
		mount([comment({ actor: { name: "navid", kind: "human" }, createdAt })]);
		const card = screen.getByRole("article");
		expect(within(card).getByRole("img", { name: "navid" })).toBeDefined();
		expect(within(card).getByText("navid")).toBeDefined();
		const time = card.querySelector("time")!;
		expect(time.getAttribute("datetime")).toBe(createdAt);
		expect(time.textContent).toMatch(/ago|now/);
		expect(time.getAttribute("title")).toMatch(/22:52|10:52/);
		const body = card.querySelector(".markdown")!;
		expect(body.querySelector("strong")!.textContent).toBe("1.27");
		await user.click(within(card).getByRole("button", { name: "Comment actions" }));
		const menuItems = await screen.findAllByRole("menuitem");
		expect(menuItems.map((item) => item.textContent!.trim())).toEqual(["Edit", "Copy markdown", "Delete"]);
		for (const item of menuItems) {
			item.focus();
			expect(document.activeElement).toBe(item);
		}
	});

	// WT-78. Who said what stays legible at speed: the agent card has the
	// agent-colored left border, the human card the neutral one.
	test("an agent comment carries the agent border", () => {
		mount([
			comment({ id: "01J8Z6X4Q3M2K1H0G9F8E7D6C1" }),
			comment({ id: "01J8Z6X4Q3M2K1H0G9F8E7D6C2", actor: { name: "navid", kind: "human" } }),
		]);
		const cards = screen.getAllByRole("article");
		expect(cards).toHaveLength(2);
		expect(cards[0]!.className).toMatch(/\bborder-l/);
		expect(cards[0]!.className).toMatch(/\bborder-l-agent\b|\bborder-agent\b/);
		expect(cards[1]!.className).toMatch(/\bborder-l/);
		expect(cards[1]!.className).toMatch(/\bborder-l-border\b|\bborder-border\b/);
		expect(cards[1]!.className).not.toMatch(/border-agent/);
	});
});

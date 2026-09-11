import { beforeEach, describe, expect, test } from "bun:test";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Comment } from "@trellis/api";
import { ticketId } from "../../../../../../test/fixtures";
import { renderWithProviders } from "../../../../../../test/renderWithProviders";
import { ago, hour } from "../../../../../../test/ticketHost";
import { compactRelativeTime } from "../../../../../lib/format";
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
	parentId: null,
	resolvedAt: null,
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
		{ path: "/t/CDE-42", actor: "dana" },
	);

describe("features/ticket/Timeline/components/CommentCard", () => {
	// WT-77. The relative time is the text; the absolute time is its title.
	test("renders a comment card with its actor, time, body, and menu", async () => {
		const user = userEvent.setup();
		const createdAt = at2252();
		mount([comment({ actor: { name: "dana", kind: "human" }, createdAt })]);
		const card = screen.getByRole("article");
		expect(within(card).getByRole("img", { name: "dana" })).toBeDefined();
		expect(within(card).getByText("dana")).toBeDefined();
		const time = card.querySelector("time")!;
		expect(time.getAttribute("datetime")).toBe(createdAt);
		expect(time.textContent).toBe(compactRelativeTime(createdAt));
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

	test("comments use plain bodies with compact actor names", () => {
		mount([
			comment({ id: "01J8Z6X4Q3M2K1H0G9F8E7D6C1" }),
			comment({ id: "01J8Z6X4Q3M2K1H0G9F8E7D6C2", actor: { name: "dana", kind: "human" } }),
		]);
		const cards = screen.getAllByRole("article");
		expect(cards).toHaveLength(2);
		for (const card of cards) {
			expect(card.className).not.toMatch(/\bborder|\brounded/);
		}
		expect(screen.queryByText("· agent")).toBeNull();
	});

	test("long comments fold until the reader expands them", async () => {
		const user = userEvent.setup();
		mount([comment({ body: "A detailed progress report. ".repeat(50) })]);
		const button = screen.getByRole("button", { name: "Show more" });
		expect(button.getAttribute("aria-expanded")).toBe("false");
		const body = document.getElementById(button.getAttribute("aria-controls")!)!;
		expect(body.className).toContain("max-h-60");
		await user.click(button);
		expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe("true");
		expect(body.className).not.toContain("max-h-60");
		await user.click(screen.getByRole("button", { name: "Show less" }));
		expect(body.className).toContain("max-h-60");
	});

	test("short comments show their full body without an expand control", () => {
		mount([comment({})]);
		expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
	});
});

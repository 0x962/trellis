import { describe, expect, test } from "bun:test";
import type { StatusCategory, TicketSummary } from "@trellis/api";
import type { BoardColumnModel } from "../../types";
import { visibleCards } from "./visibleCards";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const ticket = (id: string, completedAt: string | null): TicketSummary => ({ id, completedAt }) as TicketSummary;

const column = (category: StatusCategory, items: TicketSummary[]): BoardColumnModel => ({
	id: category,
	name: category,
	category,
	statuses: [],
	items,
	count: items.length,
});

const ids = (cards: readonly TicketSummary[]) => cards.map((card) => card.id);

describe("visibleCards", () => {
	test("draws no card for a collapsed column", () => {
		const started = column("started", [ticket("a", null), ticket("b", null)]);

		expect(visibleCards(started, { collapsed: true, showAllDone: false })).toEqual([]);
	});

	test("draws every ticket of an open column that is not done", () => {
		const started = column("started", [ticket("a", null), ticket("b", null)]);

		expect(ids(visibleCards(started, { collapsed: false, showAllDone: false }))).toEqual(["a", "b"]);
	});

	test("drops a done ticket completed more than 30 days ago", () => {
		const done = column("done", [ticket("recent", daysAgo(2)), ticket("old", daysAgo(40)), ticket("open", null)]);

		expect(ids(visibleCards(done, { collapsed: false, showAllDone: false }))).toEqual(["recent"]);
	});

	test("draws every done ticket once the person asks for all of them", () => {
		const done = column("done", [ticket("recent", daysAgo(2)), ticket("old", daysAgo(40))]);

		expect(ids(visibleCards(done, { collapsed: false, showAllDone: true }))).toEqual(["recent", "old"]);
	});

	test("draws no card for a collapsed done column", () => {
		const done = column("done", [ticket("recent", daysAgo(2))]);

		expect(visibleCards(done, { collapsed: true, showAllDone: true })).toEqual([]);
	});
});

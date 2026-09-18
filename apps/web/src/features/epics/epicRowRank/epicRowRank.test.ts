import { expect, test } from "bun:test";
import type { TicketSummary } from "@trellis/api";
import { assignedTicketIds, epicRowRank } from "./epicRowRank";

const ticket = (id: string, category: string, reviewer: string | null = null) =>
	({ id, status: { category, reviewer } }) as TicketSummary;

test("only an agent run on a ticket marks the ticket as assigned", () => {
	const ids = assignedTicketIds([
		{ kind: "agent", ticketId: "a" },
		{ kind: "session", ticketId: "b" },
		{ kind: "agent", ticketId: null },
	] as Parameters<typeof assignedTicketIds>[0]);

	expect([...ids]).toEqual(["a"]);
});

test("ranks by what the person does next", () => {
	const rank = epicRowRank(new Set(["running", "reviewed", "closed"]));

	expect(rank(ticket("waits", "review", "human"))).toBe(0);
	expect(rank(ticket("reviewed", "review", "human"))).toBe(0);
	expect(rank(ticket("start", "todo"))).toBe(1);
	expect(rank(ticket("running", "todo"))).toBe(2);
	expect(rank(ticket("idle", "started"))).toBe(3);
	expect(rank(ticket("agent-review", "review", "agent"))).toBe(3);
	expect(rank(ticket("closed", "done"))).toBe(4);
	expect(rank(ticket("dropped", "canceled"))).toBe(4);
});

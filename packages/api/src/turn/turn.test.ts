import { expect, test } from "bun:test";
import type { TicketSummary } from "../schemas/ticket.ts";
import type { TicketPr } from "../schemas/ticketPr.ts";
import { turnOf } from "./turn.ts";

const pullRequest = (fields: Partial<TicketPr> = {}): TicketPr =>
	({
		number: 42,
		owner: "acme",
		repo: "app",
		url: "https://github.com/acme/app/pull/42",
		state: "open",
		isDraft: false,
		localState: "ready",
		fail: 0,
		pending: 0,
		openThreads: 0,
		...fields,
	}) as TicketPr;

const ticket = (fields: {
	category?: TicketSummary["status"]["category"];
	reviewer?: TicketSummary["status"]["reviewer"];
	waitsOn?: TicketSummary["waitsOn"];
	prRows?: TicketPr[];
	ready?: boolean;
}): TicketSummary =>
	({
		status: {
			category: fields.category ?? "started",
			reviewer: fields.reviewer ?? null,
		},
		waitsOn: fields.waitsOn ?? [],
		prRows: fields.prRows ?? [],
		ready: fields.ready ?? false,
	}) as TicketSummary;

test("gives a review-ready pull request to you", () => {
	expect(turnOf(pullRequest(), false)).toBe("you");
});

test("gives a draft pull request to the agent", () => {
	expect(turnOf(pullRequest({ isDraft: true }), false)).toBe("agent");
});

test("gives a pull request to the agent until the agent marks it ready", () => {
	expect(turnOf(pullRequest({ localState: "draft" }), false)).toBe("agent");
	expect(turnOf(ticket({ prRows: [pullRequest({ localState: "draft" })] }), false)).toBe("agent");
});

test("gives a ticket with a draft pull request to the agent", () => {
	expect(turnOf(ticket({ prRows: [pullRequest({ isDraft: true })] }), false)).toBe("agent");
});

test("gives a pull request with pending checks to GitHub", () => {
	expect(turnOf(pullRequest({ pending: 1 }), false)).toBe("github");
});

test("returns ready for a Todo ticket with no unmet dependency", () => {
	expect(turnOf(ticket({ category: "todo", ready: true }), false)).toBe("ready");
});

test("waits on a merge when each unmet dependency is a ticket", () => {
	const dependency = {
		identifier: "TRL-2",
		title: "Add the row",
		status: "started" as const,
	};
	expect(turnOf(ticket({ category: "todo", waitsOn: [dependency] }), false)).toBe("waits on a merge");
});

test("returns done for a done ticket", () => {
	expect(turnOf(ticket({ category: "done" }), false)).toBe("done");
});

test("keeps a human-review ticket with you while a run works", () => {
	expect(turnOf(ticket({ category: "review", reviewer: "human" }), true)).toBe("you");
});

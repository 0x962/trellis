import { expect, test } from "bun:test";
import type { TicketSummary } from "../schemas/ticket.ts";
import type { TicketPr } from "../schemas/ticketPr.ts";
import { waitingFor } from "./waiting.ts";

// The row carries the gaps the server computed, so a test states them the
// way a row does.
const pullRequest = (fields: Partial<TicketPr> = {}): TicketPr =>
	({
		number: 42,
		owner: "acme",
		repo: "app",
		url: "https://github.com/acme/app/pull/42",
		state: "open",
		isDraft: false,
		reviewGaps: [],
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

test("a review-ready pull request waits for you", () => {
	expect(waitingFor(pullRequest(), false)).toBe("you");
});

test("a pull request whose Trellis state is ready waits for you", () => {
	expect(waitingFor(pullRequest({ isDraft: true }), false)).toBe("you");
});

test("a pull request waits for the agent until the agent asks for review", () => {
	const gaps: TicketPr["reviewGaps"] = [{ kind: "not-asked", count: 1 }];
	expect(waitingFor(pullRequest({ reviewGaps: gaps }), false)).toBe("agent");
	expect(waitingFor(ticket({ prRows: [pullRequest({ reviewGaps: gaps })] }), false)).toBe("agent");
});

test("a pull request with an open finding waits for the agent", () => {
	expect(waitingFor(pullRequest({ reviewGaps: [{ kind: "findings", count: 2 }] }), false)).toBe("agent");
});

test("a pull request with a running check and a finding waits for the agent", () => {
	const gaps: TicketPr["reviewGaps"] = [
		{ kind: "checks-pending", count: 1 },
		{ kind: "findings", count: 1 },
	];
	expect(waitingFor(pullRequest({ reviewGaps: gaps }), false)).toBe("agent");
});

test("a ticket with a ready pull request waits for you", () => {
	expect(waitingFor(ticket({ prRows: [pullRequest({ isDraft: true })] }), false)).toBe("you");
});

test("a pull request that needs only a check waits for GitHub", () => {
	expect(waitingFor(pullRequest({ pending: 1, reviewGaps: [{ kind: "checks-pending", count: 1 }] }), false)).toBe(
		"github",
	);
});

test("returns ready for a Todo ticket with no unmet dependency", () => {
	expect(waitingFor(ticket({ category: "todo", ready: true }), false)).toBe("ready");
});

test("a Todo ticket with an unmet dependency waits for a merge", () => {
	const dependency = {
		identifier: "TRL-2",
		title: "Add the row",
		status: "started" as const,
	};
	expect(waitingFor(ticket({ category: "todo", waitsOn: [dependency] }), false)).toBe("merge");
});

test("returns done for a done ticket", () => {
	expect(waitingFor(ticket({ category: "done" }), false)).toBe("done");
});

test("a human-review ticket waits for you while a run works", () => {
	expect(waitingFor(ticket({ category: "review", reviewer: "human" }), true)).toBe("you");
});

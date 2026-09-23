import { expect, test } from "bun:test";
import type { TicketPr, TicketSummary } from "@trellis/api";
import { readyResultOf } from "./ready.ts";
import { readyText } from "./readyText.ts";

const pullRequest = (number: number, fields: Partial<TicketPr> = {}): TicketPr =>
	({
		number,
		state: "open",
		isDraft: false,
		reviewGaps: [],
		fail: 0,
		pending: 0,
		openThreads: 0,
		...fields,
	}) as TicketPr;

const ticket = (
	identifier: string,
	fields: {
		category?: TicketSummary["status"]["category"];
		reviewer?: TicketSummary["status"]["reviewer"];
		waitsOn?: TicketSummary["waitsOn"];
		prRows?: TicketPr[];
		ready?: boolean;
	} = {},
): TicketSummary =>
	({
		id: identifier,
		identifier,
		status: {
			category: fields.category ?? "started",
			reviewer: fields.reviewer ?? null,
		},
		waitsOn: fields.waitsOn ?? [],
		prRows: fields.prRows ?? [],
		ready: fields.ready ?? false,
	}) as TicketSummary;

test("prints the nonempty groups in fixed order", () => {
	const startedBlocker = {
		identifier: "OP-32",
		title: "Run the routines",
		status: "started" as const,
	};
	const result = readyResultOf(
		[
			ticket("OP-34", { category: "todo", waitsOn: [startedBlocker] }),
			ticket("OP-53", { category: "review", reviewer: "human" }),
			ticket("OP-32", {
				prRows: [pullRequest(55569, { reviewGaps: [{ kind: "not-asked", count: 1 }] })],
			}),
			ticket("OP-41", { category: "todo", ready: true }),
			ticket("OP-29", { category: "done" }),
		],
		new Set(),
	);

	expect(result).toEqual({
		readyToStart: { count: 1, identifiers: ["OP-41"] },
		groups: [
			{ waiting: "merge", label: "waits on a merge", count: 1, names: ["OP-34"] },
			{ waiting: "you", label: "waits for you", count: 1, names: ["OP-53"] },
			{ waiting: "agent", label: "with an agent", count: 1, names: ["#55569"] },
		],
	});
	expect(readyText(result)).toBe(`1 ready to start

waits on a merge        1   OP-34
waits for you           1   OP-53
with an agent           1   #55569
`);
	expect(readyText(result).split("\n").filter(Boolean)).toHaveLength(4);
});

test("uses a ticket identifier when a working run holds the ticket", () => {
	const result = readyResultOf(
		[
			ticket("OP-32", {
				prRows: [pullRequest(55569, { reviewGaps: [{ kind: "not-asked", count: 1 }] })],
			}),
		],
		new Set(["OP-32"]),
	);
	expect(result.groups).toEqual([{ waiting: "agent", label: "with an agent", count: 1, names: ["OP-32"] }]);
});

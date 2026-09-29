import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/query-core";
import { createEventApplier } from "../query-keys.ts";
import type { Status } from "../schemas/status.ts";
import type { Ticket, TicketSummary } from "../schemas/ticket.ts";

const status = {
	id: "01J00000000000000000000001",
	projectId: "01J00000000000000000000002",
	name: "Todo",
	slug: "todo",
	category: "todo",
	color: "accent",
	description: "",
	position: 0,
	isDefault: true,
	createdAt: "2026-09-29T00:00:00.000Z",
	updatedAt: "2026-09-29T00:00:00.000Z",
} satisfies Status;

const ticket = (ticketNumber: number, prefix = "TRL"): TicketSummary => ({
	id: `01J${ticketNumber.toString().padStart(23, "0")}`,
	identifier: `${prefix}-${ticketNumber}`,
	number: ticketNumber,
	title: `Ticket ${ticketNumber}`,
	priority: "none",
	status,
	project: { id: status.projectId, key: "TRL" },
	parent: null,
	ancestors: [],
	epic: null,
	wave: null,
	childCount: 0,
	childDoneCount: 0,
	attachmentCount: 0,
	labels: [],
	waitsOn: [],
	releases: [],
	ready: false,
	pr: null,
	prRows: [],
	lastActor: null,
	position: ticketNumber,
	version: 1,
	createdAt: "2026-09-29T00:00:00.000Z",
	updatedAt: "2026-09-29T00:00:00.000Z",
	completedAt: null,
});

const key = (name: string, input = {}) => [name.split("."), { input }];

test("a batch patches every cache shape once and preserves newer rows", () => {
	const client = new QueryClient();
	const first = ticket(1);
	const second = ticket(2);
	const newer = { ...ticket(3), version: 5 };
	const original = [first, second, newer];
	const keys = {
		list: key("tickets.list"),
		pages: [["tickets", "list"], { type: "infinite", input: { project: "TRL" } }],
		board: key("tickets.board"),
		search: key("search.query"),
		detail: key("tickets.get", { ticket: "TRL-9" }),
	};
	client.setQueryData(keys.list, { items: original });
	client.setQueryData(keys.pages, { pages: [{ items: [first] }, { items: [second, newer] }], pageParams: [0, 1] });
	client.setQueryData(keys.board, { columns: [{ items: original, count: 3 }] });
	client.setQueryData(keys.search, { tickets: original });
	client.setQueryData(keys.detail, { ...ticket(9), description: "Keep text", children: original });
	const writes = new Map<string, number>();
	const unsubscribe = client.getQueryCache().subscribe((event) => {
		if (event.type === "updated" && event.action.type === "success" && event.action.manual) {
			writes.set(event.query.queryHash, (writes.get(event.query.queryHash) ?? 0) + 1);
		}
	});
	const applier = createEventApplier(client);
	const updates = original.map((row) => ({ ...row, version: 2, priority: "high" as const }));
	applier.applySummaries(updates);
	expect([...writes.values()]).toEqual([1, 1, 1, 1, 1]);
	expect(client.getQueryData<{ items: TicketSummary[] }>(keys.list)?.items).toEqual([updates[0]!, updates[1]!, newer]);
	expect(client.getQueryData<{ pages: { items: TicketSummary[] }[] }>(keys.pages)?.pages[1]?.items).toEqual([
		updates[1]!,
		newer,
	]);
	expect(client.getQueryData<Ticket>(keys.detail)?.children).toEqual([newer]);
	expect(client.getQueryData<Ticket>(keys.detail)?.description).toBe("Keep text");
	writes.clear();
	applier.applySummaries(original, true);
	expect([...writes.values()]).toEqual([1, 1, 1, 1, 1]);
	expect(client.getQueryData<{ columns: { items: TicketSummary[]; count: number }[] }>(keys.board)?.columns[0]).toEqual(
		{ items: [], count: 0 },
	);
	expect(client.getQueryData<{ tickets: TicketSummary[] }>(keys.search)?.tickets).toEqual([]);
	expect(client.getQueryData<Ticket>(keys.detail)?.children).toEqual([]);
	unsubscribe();
	client.clear();
});

test("batch updates wait for pending edits and deleted rows reject later responses", () => {
	const client = new QueryClient();
	const original = ticket(1);
	const listKey = key("tickets.list");
	const detailKey = key("tickets.get", { ticket: original.identifier.toLowerCase() });
	client.setQueryData(listKey, { items: [original] });
	client.setQueryData(detailKey, { ...original, children: [] });
	const applier = createEventApplier(client);
	applier.beginMutation(original.id);
	expect(applier.applySummaries([{ ...original, version: 2 }])).toEqual([]);
	expect(client.getQueryData<{ items: TicketSummary[] }>(listKey)?.items[0]?.version).toBe(1);
	applier.endMutation(original.id);
	expect(client.getQueryData<{ items: TicketSummary[] }>(listKey)?.items[0]?.version).toBe(2);
	applier.applySummaries([original], true);
	expect(client.getQueryData(detailKey)).toBeUndefined();
	expect(applier.applySummaries([{ ...original, version: 3 }])).toEqual([]);
	expect(client.getQueryData<{ items: TicketSummary[] }>(listKey)?.items).toEqual([]);
	client.clear();
});

test("a fetch that finishes after a batch delete cannot restore deleted rows", async () => {
	const client = new QueryClient();
	const original = [ticket(1), ticket(2)];
	const listKey = key("tickets.list");
	client.setQueryData(listKey, { items: original });
	let finish!: (result: { items: TicketSummary[] }) => void;
	const pending = client.fetchQuery({
		queryKey: listKey,
		queryFn: () =>
			new Promise<{ items: TicketSummary[] }>((resolve) => {
				finish = resolve;
			}),
	});
	const applier = createEventApplier(client);
	applier.applySummaries(original, true);
	finish({ items: original });
	await pending;
	expect(client.getQueryData<{ items: TicketSummary[] }>(listKey)?.items).toEqual([]);
	expect(client.getQueryState(listKey)?.isInvalidated).toBeTrue();
	client.clear();
});

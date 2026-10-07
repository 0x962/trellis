import { afterEach, expect, spyOn, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { BoardOutput, BoardQueryInput, ListOutput, Status, TicketSummary } from "@trellis/api";
import { toast } from "@trellis/ui";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import type { BoardColumnModel } from "../../../types";
import { type ShowMoreOptions, useShowMore } from "./useShowMore";

const domTest = test.skipIf(typeof document === "undefined");
let dispose = async () => {};
afterEach(async () => dispose());
const tickets = (status: string, start: number, count: number) =>
	Array.from(
		{ length: count },
		(_, index) =>
			({
				id: `${status}-${start + index}`,
				status: { id: status },
			}) as TicketSummary,
	);
const column = (id = "done"): BoardColumnModel => ({
	id,
	name: id,
	category: "done",
	statuses: [{ id, slug: id }] as Status[],
	items: tickets(id, 1, 100),
	count: 205,
});
const initial = (): BoardOutput => ({
	columns: ["done", "verified"].map((statusId) => ({ statusId, count: 205, items: tickets(statusId, 1, 100) })),
});

async function mount(list: (input: Record<string, unknown>) => Promise<ListOutput>, filters: BoardQueryInput = {}) {
	const queryClient = new QueryClient();
	const key = ["board", filters];
	queryClient.setQueryData(key, initial());
	const app = { queryClient, client: { tickets: { list } } } as unknown as AppContext;
	let result!: ReturnType<typeof useShowMore>;
	function Probe(options: ShowMoreOptions) {
		result = useShowMore(options);
		return null;
	}
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	const render = async (options: ShowMoreOptions) =>
		act(async () =>
			root.render(
				<AppProvider value={app}>
					<Probe {...options} />
				</AppProvider>,
			),
		);
	await render({ filters, project: "PROOF", boardKey: key });
	dispose = async () => {
		await act(async () => root.unmount());
		container.remove();
		queryClient.clear();
	};
	return { queryClient, key, get: () => result, render };
}

domTest("loads 205 exact identities in creation order and stops at the null cursor", async () => {
	const calls: Record<string, unknown>[] = [];
	const fixture = await mount(
		async (input) => {
			calls.push(input);
			const start = input.cursor === "200" ? 201 : input.cursor === "100" ? 101 : 1;
			return {
				items: tickets("done", start, start === 201 ? 5 : 100),
				nextCursor: start === 201 ? null : String(start + 99),
			};
		},
		{ priority: ["high"], q: "synthetic", completed: "2026-01-01T00:00:00Z" },
	);
	await act(async () => fixture.get().showMore(column()));
	expect(fixture.queryClient.getQueryData<BoardOutput>(fixture.key)!.columns[0]!.items).toHaveLength(200);
	await act(async () => fixture.get().showMore(column()));
	const rows = fixture.queryClient.getQueryData<BoardOutput>(fixture.key)!.columns[0]!.items;
	expect(rows.map((row) => row.id)).toEqual(tickets("done", 1, 205).map((row) => row.id));
	expect(new Set(rows.map((row) => row.id)).size).toBe(205);
	expect(fixture.get().hasMore(column())).toBeFalse();
	await act(async () => fixture.get().showMore(column()));
	expect(calls).toHaveLength(3);
	expect(calls[1]).toEqual({
		project: "PROOF",
		status: ["done"],
		sort: "-createdAt",
		limit: 100,
		cursor: "100",
		priority: ["high"],
		q: "synthetic",
		completed: "2026-01-01T00:00:00Z",
	});
});

domTest("keeps independent cursors and pending requests for two Done statuses", async () => {
	const calls: Record<string, unknown>[] = [];
	let finish!: (page: ListOutput) => void;
	const fixture = await mount(async (input) => {
		calls.push(input);
		const status = (input.status as string[])[0]!;
		if (status === "done" && input.cursor === undefined)
			return new Promise((resolve) => {
				finish = resolve;
			});
		return { items: tickets(status, input.cursor ? 101 : 1, 100), nextCursor: input.cursor ? "200" : "100" };
	});
	let first!: Promise<void>;
	await act(async () => {
		first = fixture.get().showMore(column());
		void fixture.get().showMore(column());
	});
	expect(calls).toHaveLength(1);
	expect(fixture.get().isPending(column())).toBeTrue();
	expect(fixture.queryClient.getQueryData<BoardOutput>(fixture.key)!.columns[0]!.items).toHaveLength(100);
	await act(async () => fixture.get().showMore(column("verified")));
	expect(fixture.queryClient.getQueryData<BoardOutput>(fixture.key)!.columns[1]!.items).toHaveLength(200);
	await act(async () => {
		finish({ items: tickets("done", 1, 100), nextCursor: "100" });
		await first;
	});
	expect(fixture.queryClient.getQueryData<BoardOutput>(fixture.key)!.columns[0]!.items).toHaveLength(200);
});

domTest("preserves cards on a page failure and retries the same cursor once", async () => {
	const calls: Record<string, unknown>[] = [];
	let fail = true;
	const error = spyOn(toast, "error").mockImplementation(() => "error");
	const fixture = await mount(async (input) => {
		calls.push(input);
		if (!input.cursor) return { items: tickets("done", 1, 100), nextCursor: "100" };
		if (fail) throw new Error("Synthetic page failure");
		return { items: tickets("done", 100, 101), nextCursor: null };
	});
	await act(async () => fixture.get().showMore(column()));
	expect(fixture.queryClient.getQueryData<BoardOutput>(fixture.key)!.columns[0]!.items).toHaveLength(100);
	expect(fixture.get().isPending(column())).toBeFalse();
	const action = error.mock.calls[0]![1]!.action as { label: string; onClick: () => void };
	expect(action).toMatchObject({ label: "Retry" });
	fail = false;
	await act(async () => action.onClick());
	expect(calls[2]).toEqual(calls[1]);
	expect(fixture.queryClient.getQueryData<BoardOutput>(fixture.key)!.columns[0]!.items).toHaveLength(200);
	error.mockRestore();
});

domTest("does not send a retained Retry after the board unmounts", async () => {
	const calls: Record<string, unknown>[] = [];
	const error = spyOn(toast, "error").mockImplementation(() => "error");
	const fixture = await mount(async (input) => {
		calls.push(input);
		throw new Error("Synthetic page failure");
	});
	await act(async () => fixture.get().showMore(column()));
	const action = error.mock.calls[0]![1]!.action as { label: string; onClick: () => void };
	await dispose();
	dispose = async () => {};
	await act(async () => action.onClick());
	expect(calls).toHaveLength(1);
	error.mockRestore();
});

domTest("ignores an old response after filters change, including a return to the first query", async () => {
	let finish!: (page: ListOutput) => void;
	const fixture = await mount(
		async () =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	let pending!: Promise<void>;
	await act(async () => {
		pending = fixture.get().showMore(column());
	});
	const nextKey = ["board", { q: "other" }];
	fixture.queryClient.setQueryData(nextKey, initial());
	await fixture.render({ filters: { q: "other" }, project: "PROOF", boardKey: nextKey });
	await fixture.render({ filters: {}, project: "PROOF", boardKey: fixture.key });
	await act(async () => {
		finish({ items: tickets("done", 101, 100), nextCursor: "100" });
		await pending;
	});
	expect(fixture.queryClient.getQueryData<BoardOutput>(fixture.key)!.columns[0]!.items).toHaveLength(100);
	expect(fixture.queryClient.getQueryData<BoardOutput>(nextKey)!.columns[0]!.items).toHaveLength(100);
	expect(fixture.get().isPending(column())).toBeFalse();
});

domTest("restarts from the first cursor after the board first page is replaced", async () => {
	const calls: Record<string, unknown>[] = [];
	const fixture = await mount(async (input) => {
		calls.push(input);
		return { items: tickets("done", input.cursor ? 101 : 1, 100), nextCursor: input.cursor ? "200" : "100" };
	});
	await act(async () => fixture.get().showMore(column()));
	await act(async () => {
		fixture.queryClient.setQueryData(fixture.key, initial());
	});
	await act(async () => fixture.get().showMore(column()));
	expect(calls.map((call) => call.cursor)).toEqual([undefined, "100", undefined, "100"]);
});

domTest("ignores an in-flight continuation after a replacement first page", async () => {
	let finish!: (page: ListOutput) => void;
	const fixture = await mount(async (input) =>
		input.cursor
			? new Promise((resolve) => {
					finish = resolve;
				})
			: { items: tickets("done", 1, 100), nextCursor: "100" },
	);
	let pending!: Promise<void>;
	await act(async () => {
		pending = fixture.get().showMore(column());
		await Promise.resolve();
	});
	await act(async () => {
		fixture.queryClient.setQueryData(fixture.key, initial());
	});
	await act(async () => {
		finish({ items: tickets("done", 101, 100), nextCursor: "200" });
		await pending;
	});
	expect(fixture.queryClient.getQueryData<BoardOutput>(fixture.key)!.columns[0]!.items).toHaveLength(100);
});

import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ListOutput, ListQueryInput, Status, TicketSummary } from "@trellis/api";
import { act, type ReactElement } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../lib/appContext";
import { type View, viewOf } from "../../../filters/grammar";
import { type TableData, useTableData } from "./useTableData";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const status = {
	id: "01M330000000000000000STS01",
	projectId: "01M330000000000000000PRJ01",
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

const ticket = (number: number, prefix = "TRL"): TicketSummary => ({
	id: `ticket-${prefix}-${number}`,
	identifier: `${prefix}-${number}`,
	number,
	title: `Ticket ${number}`,
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
	position: number,
	version: 1,
	createdAt: "2026-09-29T00:00:00.000Z",
	updatedAt: "2026-09-29T00:00:00.000Z",
	completedAt: null,
});

const pageNumber = (cursor: string | undefined) => (cursor === undefined ? 1 : Number(cursor.slice("page-".length)));

test("useTableData follows cursors and replaces rows after a filter change", async () => {
	const requests: ListQueryInput[] = [];
	const list = async (input: ListQueryInput): Promise<ListOutput> => {
		requests.push(input);
		if (input.q === "old") return { items: [ticket(1, "OLD")], nextCursor: null };
		const number = pageNumber(input.cursor);
		const count = number === 11 ? 1 : 200;
		return {
			items: Array.from({ length: count }, (_value, index) => ticket((number - 1) * 200 + index + 1)),
			nextCursor: number === 11 ? null : `page-${number + 1}`,
		};
	};
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const app = {
		queryClient,
		orpc: {
			statuses: {
				list: {
					queryOptions: ({ input }: { input: { project: string } }) => ({
						queryKey: ["statuses", input],
						queryFn: async () => ({ statuses: [status] }),
					}),
				},
			},
			projects: {
				list: {
					queryOptions: () => ({ queryKey: ["projects"], queryFn: async () => [] }),
				},
			},
			tickets: {
				list: {
					infiniteOptions: (options: {
						input: (cursor: string | undefined) => ListQueryInput;
						initialPageParam: string | undefined;
						getNextPageParam: (page: ListOutput) => string | undefined;
					}) => ({
						...options,
						queryKey: [["tickets", "list"], { input: options.input(undefined), type: "infinite" }],
						queryFn: ({ pageParam }: { pageParam: string | undefined }) => list(options.input(pageParam)),
					}),
				},
				counts: {
					queryOptions: ({ input }: { input: ListQueryInput }) => ({
						queryKey: ["ticket-counts", input],
						queryFn: async () => ({ total: input.q === "old" ? 1 : 2001, byStatus: [] }),
					}),
				},
			},
		},
	} as unknown as AppContext;
	let data: TableData | undefined;
	const renderer = createRoot();
	const Probe = ({ view }: { view: View }) => {
		data = useTableData({ project: "TRL", view, expanded: [] });
		return null;
	};
	const fixture = (view: View): ReactElement => (
		<QueryClientProvider client={queryClient}>
			<AppProvider value={app}>
				<Probe view={view} />
			</AppProvider>
		</QueryClientProvider>
	);
	const settle = async (condition: () => boolean) => {
		for (let attempt = 0; attempt < 100 && !condition(); attempt += 1) {
			await act(async () => await new Promise((resolve) => setTimeout(resolve, 10)));
		}
		expect(condition()).toBeTrue();
	};

	await act(async () => {
		renderer.render(fixture(viewOf({ q: "old" })));
	});
	await settle(() => data?.allActiveLoaded === true);
	expect(data?.rows.map((row) => row.identifier)).toEqual(["OLD-1"]);

	await act(async () => renderer.render(fixture(viewOf({ q: "new" }))));
	await settle(() => data?.allActiveLoaded === true && data.rows.length === 2001);

	const newRequests = requests.filter((input) => input.q === "new");
	expect(newRequests).toHaveLength(11);
	expect(newRequests[10]?.cursor).toBe("page-11");
	expect(data?.rows[2000]?.identifier).toBe("TRL-2001");
	expect(data?.rows.some((row) => row.identifier === "OLD-1")).toBeFalse();

	await act(async () => renderer.unmount());
	queryClient.clear();
});

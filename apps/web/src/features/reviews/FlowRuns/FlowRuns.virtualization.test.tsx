import { afterAll, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defaultRangeExtractor, Virtualizer, type VirtualizerOptions } from "@tanstack/react-virtual";
import { executionViewV1Example, type FlowExecutionViewV1 } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";

const RealVirtualizer = Virtualizer;
const extractRange = defaultRangeExtractor;
let list: Virtualizer<HTMLElement, HTMLElement> | undefined;
mock.module("@tanstack/react-virtual", () => ({
	defaultRangeExtractor: extractRange,
	useVirtualizer: (options: Partial<VirtualizerOptions<HTMLElement, HTMLElement>>) => {
		const complete = {
			...options,
			count: options.count!,
			estimateSize: options.estimateSize!,
			getScrollElement: () => null,
			initialRect: { width: 600, height: 600 },
			scrollToFn: () => undefined,
			observeElementRect: () => undefined,
			observeElementOffset: () => undefined,
		};
		if (list) list.setOptions(complete);
		else list = new RealVirtualizer(complete);
		return {
			getTotalSize: list.getTotalSize,
			getVirtualItems: list.getVirtualItems,
			scrollToIndex: list.scrollToIndex,
			measureElement: () => undefined,
		};
	},
}));
mock.module("@tanstack/react-router", () => ({ useLocation: () => "" }));
mock.module("@trellis/ui", () => ({
	EmptyState: () => null,
	FailureState: () => null,
	IconButton: () => null,
	SectionHeader: () => null,
	Skeleton: () => null,
	Tooltip: () => null,
}));
mock.module("./components/FlowRun", () => ({ FlowRun: () => null }));
mock.module("./components/StartFlowDialog", () => ({ StartFlowDialog: () => null }));
const { FlowRuns } = await import("./FlowRuns");
afterAll(() => mock.restore());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("scroll redraws reuse measurements for ten thousand saved runs", async () => {
	const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
	const records: FlowExecutionViewV1[] = Array.from({ length: 10_000 }, (_, index) => ({
		...executionViewV1Example,
		id: `run-${index}`,
		status: "succeeded",
		detail: "completed",
	}));
	const ids = records.map((row) => row.id);
	for (const row of records) queryClient.setQueryData(["view", row.id], row);
	const app = {
		queryClient,
		orpc: {
			flowExecutions: { list: { queryOptions: () => ({ queryKey: ["legacy"] }) } },
			flowDocumentsV1: {
				view: { queryOptions: ({ input }: { input: { id: string } }) => ({ queryKey: ["view", input.id] }) },
			},
		},
		client: {
			flowDocumentsV1: {
				view: () => {
					throw new Error("Cached snapshots must not fetch");
				},
			},
		},
	} as unknown as AppContext;
	const root = createRoot();
	const redraw = () =>
		act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<AppProvider value={app}>
						<FlowRuns ticket="TRL-689" headSha="head" diffId="virtual-test" executionIds={ids} readOnly />
					</AppProvider>
				</QueryClientProvider>,
			);
		});
	await redraw();
	const first = list!.measurementsCache;
	const key = list!.options.getItemKey;
	expect(first.length).toBe(10_000);
	list!.scrollOffset = 120_000;
	await redraw();
	expect(list!.options.getItemKey).toBe(key);
	expect(list!.measurementsCache).toBe(first);
	expect(list!.getVirtualItems().some((item) => item.index >= 1_000)).toBe(true);
	await act(async () => root.unmount());
	queryClient.clear();
	list = undefined;
}, 30_000);

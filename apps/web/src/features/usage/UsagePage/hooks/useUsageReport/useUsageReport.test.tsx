import { expect, test } from "bun:test";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import type { TrellisClient, UsageDays, UsageReport, UsageReportInput } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import { useUsageReport } from "./useUsageReport";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const report = (days: UsageDays, hour = 12) => ({ days, computedAt: `2026-09-30T${hour}:00:00Z` }) as UsageReport;

const mount = async () => {
	const requests: UsageReportInput[] = [];
	const scan = Promise.withResolvers<UsageReport>();
	const client = {
		usage: {
			report: async (input: UsageReportInput) => {
				requests.push(input);
				return input.refresh ? scan.promise : report(input.days ?? 30);
			},
		},
	} as unknown as TrellisClient;
	const orpc = createTanstackQueryUtils(client);
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	let controls: ReturnType<typeof useUsageReport>;
	let body: ReturnType<typeof useUsageReport>;
	const Probe = () => {
		controls = useUsageReport();
		body = useUsageReport();
		return null;
	};
	const root = createRootRoute({ component: Probe });
	const route = createRoute({ getParentRoute: () => root, path: "/usage", validateSearch: (value) => value });
	const router = createRouter({
		routeTree: root.addChildren([route]),
		history: createMemoryHistory({ initialEntries: ["/usage"] }),
	});
	await router.load();
	const renderer = createRoot();
	const render = () =>
		renderer.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={{ client, orpc, queryClient } as unknown as AppContext}>
					<RouterContextProvider router={router}>
						<Probe />
					</RouterContextProvider>
				</AppProvider>
			</QueryClientProvider>,
		);
	await act(async () => render());
	const settle = async (condition: () => boolean) => {
		for (let n = 0; n < 100 && !condition(); n++)
			await act(async () => {
				await Bun.sleep(5);
			});
		expect(condition()).toBe(true);
	};
	await settle(() => body!.report.isSuccess);
	return {
		controls: () => controls!,
		body: () => body!,
		requests,
		scan,
		router,
		render,
		settle,
		orpc,
		queryClient,
		stop: async () => {
			await act(async () => renderer.unmount());
			queryClient.clear();
		},
	};
};

test("refresh keeps the report visible and installs the returned data without another read", async () => {
	const h = await mount();
	try {
		await act(async () => h.controls().refresh.mutate());
		await h.settle(() => h.controls().refresh.isPending);
		expect(h.body().report.data).toEqual(report(30));
		expect(h.body().report.isFetching).toBe(false);
		await act(async () => h.scan.resolve(report(30, 13)));
		await h.settle(() => h.body().report.data?.computedAt === report(30, 13).computedAt);
		expect(h.requests).toEqual([{ days: 30 }, { days: 30, refresh: true }]);
	} finally {
		await h.stop();
	}
});

test("a refresh completes into its original range after the selected range changes", async () => {
	const h = await mount();
	try {
		await act(async () => h.controls().refresh.mutate());
		await h.settle(() => h.controls().refresh.isPending);
		await act(async () => {
			h.router.history.push("/usage?days=7");
			await h.router.load();
			h.render();
		});
		await h.settle(() => h.body().report.data?.days === 7);
		await act(async () => h.scan.resolve(report(30, 13)));
		await h.settle(() => !h.controls().refresh.isPending);
		expect(h.body().report.data).toEqual(report(7));
		expect(
			h.queryClient.getQueryData<UsageReport>(h.orpc.usage.report.queryOptions({ input: { days: 30 } }).queryKey),
		).toEqual(report(30, 13));
		expect(h.requests).toEqual([{ days: 30 }, { days: 30, refresh: true }, { days: 7 }]);
	} finally {
		await h.stop();
	}
});

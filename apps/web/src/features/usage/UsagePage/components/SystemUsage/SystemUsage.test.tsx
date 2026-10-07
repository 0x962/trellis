import { expect, test } from "bun:test";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	type MachinePressure,
	MachinePressureSchema,
	type SystemUsage as SystemUsageData,
	SystemUsageSchema,
	type TrellisClient,
} from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import {
	systemUsage,
	systemUsageAt,
	systemUsageWithMemory,
	usageResponses,
} from "../../../../../stories/pages/fixtures/usage";
import { SystemUsage } from "./SystemUsage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mount = async (initial = systemUsage) => {
	let response = () => Promise.resolve(initial);
	let pressureResponse: () => Promise<MachinePressure> = () => Promise.resolve(usageResponses["system.pressure"]);
	const client = {
		system: {
			usage: () => response(),
			pressure: () => pressureResponse(),
		},
	} as unknown as TrellisClient;
	const orpc = createTanstackQueryUtils(client);
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
	const options = orpc.system.usage.queryOptions({});
	queryClient.setQueryData(options.queryKey, initial);
	queryClient.setQueryData(
		orpc.system.pressure.queryOptions({ input: { includeRuns: true } }).queryKey,
		usageResponses["system.pressure"],
	);
	const root = createRoot();
	await act(async () => {
		root.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={{ client, orpc, queryClient } as AppContext}>
					<SystemUsage />
				</AppProvider>
			</QueryClientProvider>,
		);
	});
	return {
		root,
		text: () => JSON.stringify(root.container.toJSON()),
		update: async (data: SystemUsageData) => {
			await act(async () => {
				queryClient.setQueryData(options.queryKey, data);
				await Bun.sleep(5);
			});
		},
		refetch: (next: () => Promise<SystemUsageData>) => {
			response = next;
			return queryClient.refetchQueries({ queryKey: options.queryKey });
		},
		refetchPressure: (response: () => Promise<MachinePressure>) => {
			pressureResponse = response;
			return queryClient.refetchQueries({
				queryKey: orpc.system.pressure.queryOptions({ input: { includeRuns: true } }).queryKey,
			});
		},
		stop: async () => {
			await act(async () => root.unmount());
			queryClient.clear();
		},
	};
};

test("a pending update and a failed update retain metrics and history", async () => {
	const h = await mount();
	const update = Promise.withResolvers<SystemUsageData>();
	let pending: Promise<void>;
	await act(async () => {
		pending = h.refetch(() => update.promise);
		await Bun.sleep(5);
	});
	expect(h.text()).toContain("38.0%");
	expect(h.text()).toContain("Recent CPU usage");
	expect(h.text()).not.toContain("Load system usage");
	await act(async () => {
		update.reject(new Error("Synthetic poll failure"));
		await pending!;
		await Bun.sleep(5);
	});
	expect(h.text()).toContain("Could not update system usage");
	expect(h.text()).toContain("These values are out of date");
	expect(h.text()).toContain("38.0%");
	expect(h.text()).toContain("Recent memory use");
	await act(async () => {
		await h.refetch(() => Promise.resolve({ ...systemUsage, cpuPercent: 48 }));
		await Bun.sleep(5);
	});
	expect(h.text()).toContain("48.0%");
	expect(h.text()).not.toContain("Could not update system usage");
	await h.stop();
});

test("empty history leaves current metrics available and omits empty charts", async () => {
	const h = await mount({ ...systemUsage, history: [] });
	expect(h.text()).toContain("No recent samples");
	expect(h.text()).toContain("38.0%");
	expect(h.text()).not.toContain("Recent CPU usage");
	expect(h.text()).not.toContain("Select a sample");
	await h.stop();
});

test("both charts retain one selected timestamp when the history advances", async () => {
	const h = await mount();
	const first = systemUsage.history[0]!;
	const cpu = () =>
		h.root.container.queryAll(
			(node) => node.type === "button" && String(node.props["aria-label"]).startsWith("Recent CPU usage."),
		)[0]!;
	await act(async () => cpu().props.onClick({ detail: 0 }));
	const selected = () => h.root.container.queryAll((node) => node.props["data-selected-day"] === first.at);
	expect(selected()).toHaveLength(2);
	expect(h.text()).toContain("Selected sample at");
	expect(h.text()).toContain("Normal");
	await h.update({
		...systemUsage,
		sampledAt: new Date(Date.parse(systemUsage.sampledAt) + 2_000).toISOString(),
		history: [
			...systemUsage.history,
			{ ...first, at: new Date(Date.parse(systemUsage.sampledAt) + 2_000).toISOString() },
		],
	});
	expect(selected()).toHaveLength(2);
	await h.update({ ...systemUsage, history: systemUsage.history.slice(1) });
	expect(selected()).toHaveLength(0);
	expect(h.text()).not.toContain("Selected sample at");
	await h.stop();
});

test("memory fixtures agree with bytes and their latest history sample", () => {
	for (const data of [systemUsage, systemUsageWithMemory(96, 4), systemUsageAt(systemUsage.sampledAt)]) {
		SystemUsageSchema.parse(data);
		expect(data.memoryUsedBytes).toBe(Math.round((data.memoryTotalBytes * data.memoryPercent) / 100));
		expect(data.history.at(-1)?.at).toBe(data.sampledAt);
		expect(data.history.at(-1)?.memoryPercent).toBe(data.memoryPercent);
		expect(data.history.at(-1)?.cpuPercent).toBe(data.cpuPercent);
	}
});

test("memory attribution identifies separate runs without a CPU claim", async () => {
	const h = await mount(systemUsageWithMemory(96, 4));
	expect(h.text()).toContain("Critical");
	expect(h.text()).toContain("96.0%");
	expect(h.text()).toContain("Memory attribution");
	expect(h.text()).toContain("not CPU use");
	expect(h.text().match(/DEMO-40/g)).toHaveLength(2);
	expect(h.text()).toContain("Synthetic standalone session");
	expect(h.text()).toContain("2 GB");
	await h.stop();
});
test("a failed memory update retains the measured runs and marks them out of date", async () => {
	const h = await mount();
	MachinePressureSchema.parse(usageResponses["system.pressure"]);
	await act(async () => {
		await h.refetchPressure(() => Promise.reject(new Error("Synthetic memory read failure")));
		await Bun.sleep(5);
	});
	expect(h.text()).toContain("Could not update memory attribution");
	expect(h.text()).toContain("These values are out of date");
	expect(h.text().match(/DEMO-40/g)).toHaveLength(2);
	expect(h.text()).toContain("2 GB");
	expect(h.text()).toContain("38.0%");
	await h.stop();
});

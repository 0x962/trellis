import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TicketSummary } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../lib/appContext";
import { type CommandSearch, searchDebounceMs, useCommandSearch } from "./useCommandSearch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PendingSearch = {
	resolve: (value: { tickets: TicketSummary[] }) => void;
	reject: (error: Error) => void;
};

const ticket = (identifier: string) => ({ identifier }) as TicketSummary;

async function fixture() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const pending = new Map<string, PendingSearch>();
	const timers = new Map<number, () => void>();
	let timerId = 0;
	let result!: CommandSearch;
	const app = {
		queryClient,
		scheduler: {
			setTimeout: (callback: () => void, delay: number) => {
				expect(delay).toBe(searchDebounceMs);
				timerId += 1;
				timers.set(timerId, callback);
				return timerId;
			},
			clearTimeout: (id: number) => timers.delete(id),
		},
		orpc: {
			search: {
				query: {
					queryOptions: ({ input }: { input: { q: string; limit: number } }) => ({
						queryKey: ["search", input],
						queryFn: () =>
							new Promise<{ tickets: TicketSummary[] }>((resolve, reject) => {
								pending.set(input.q, { resolve, reject });
							}),
					}),
				},
			},
		},
	} as unknown as AppContext;
	const Probe = ({ query }: { query: string }) => {
		result = useCommandSearch(query);
		return null;
	};
	const root = createRoot();
	const mount = (query: string) =>
		act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<AppProvider value={app}>
						<Probe query={query} />
					</AppProvider>
				</QueryClientProvider>,
			);
		});
	const runTimer = () =>
		act(async () => {
			const next = [...timers.entries()].at(-1);
			if (next === undefined) throw new Error("No search timer is pending.");
			timers.delete(next[0]);
			next[1]();
		});
	const settle = () =>
		act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
	return {
		mount,
		runTimer,
		result: () => result,
		pending,
		settle,
		close: async () => {
			await act(async () => root.unmount());
			queryClient.clear();
		},
	};
}

test("search states hide stale results until the current query completes", async () => {
	const f = await fixture();
	await f.mount("");
	expect(f.result().state).toBe("idle");
	await f.mount("catalog");
	expect(f.result().state).toBe("loading");
	await f.runTimer();
	f.pending.get("catalog")!.resolve({ tickets: [ticket("TRL-4")] });
	await f.settle();
	expect(f.result().state).toBe("success");
	expect(f.result().tickets.map((item) => item.identifier)).toEqual(["TRL-4"]);

	await f.mount("review");
	expect(f.result().state).toBe("loading");
	expect(f.result().tickets).toEqual([]);
	await f.runTimer();
	f.pending.get("review")!.resolve({ tickets: [ticket("TRL-9")] });
	await f.settle();
	expect(f.result().state).toBe("success");
	expect(f.result().tickets.map((item) => item.identifier)).toEqual(["TRL-9"]);
	await f.close();
});

test("a failed search exposes its message and retries the same query", async () => {
	const f = await fixture();
	await f.mount("catalog");
	await f.runTimer();
	f.pending.get("catalog")!.reject(new Error("Search is unavailable."));
	await f.settle();
	expect(f.result().state).toBe("error");
	expect(f.result().error).toBe("Search is unavailable.");

	await act(async () => f.result().retry());
	f.pending.get("catalog")!.resolve({ tickets: [ticket("TRL-4")] });
	await f.settle();
	expect(f.result().state).toBe("success");
	expect(f.result().error).toBeNull();
	await f.close();
});

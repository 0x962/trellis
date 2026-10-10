import { afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TrellisClient } from "@trellis/api";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../../../lib/appContext";
import { useWhiteboardConnections } from "./useWhiteboardConnections";

type TicketUpdateDependenciesInput = Parameters<TrellisClient["tickets"]["updateDependencies"]>[0];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function fixture(readOnly = false, fail = false) {
	const queryClient = new QueryClient();
	const requests: TicketUpdateDependenciesInput[] = [];
	const invalidated: string[] = [];
	queryClient.invalidateQueries = async ({ queryKey } = {}) => {
		invalidated.push(String(queryKey?.[0]));
	};
	const app = {
		queryClient,
		orpc: { tickets: { key: () => ["tickets"] }, search: { key: () => ["search"] }, epics: { key: () => ["epics"] } },
		client: {
			tickets: {
				updateDependencies: async (input: TicketUpdateDependenciesInput) => {
					requests.push(input);
					if (fail) throw new Error("These tickets form a dependency cycle.");
					return {};
				},
			},
		},
	} as unknown as AppContext;
	let hook!: ReturnType<typeof useWhiteboardConnections>;
	function Probe() {
		hook = useWhiteboardConnections(readOnly);
		return null;
	}
	const root = createRoot();
	await act(async () =>
		root.render(
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>
					<Probe />
				</AppProvider>
			</QueryClientProvider>,
		),
	);
	cleanups.push(async () => {
		await act(async () => root.unmount());
		queryClient.clear();
	});
	return {
		requests,
		invalidated,
		state: () => hook,
		connect: async () => {
			await act(async () => {
				hook.connect("prerequisite", "dependent");
				await new Promise((resolve) => setTimeout(resolve, 10));
			});
		},
	};
}

test("connection makes the target wait for the source and refreshes ticket views", async () => {
	const f = await fixture();
	await f.connect();
	expect(f.requests).toEqual([{ ticket: "dependent", after: ["prerequisite"] }]);
	expect(f.invalidated).toEqual(["tickets", "search", "epics"]);
});

test("read-only boards send no dependency request", async () => {
	const f = await fixture(true);
	await f.connect();
	expect(f.requests).toEqual([]);
});

test("rejected dependencies expose the error without a local edge or retry", async () => {
	const f = await fixture(false, true);
	await f.connect();
	expect(f.state().error?.message).toBe("These tickets form a dependency cycle.");
	expect(f.requests).toHaveLength(1);
	expect(f.invalidated).toEqual([]);
});

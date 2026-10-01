import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { type AppContext, AppProvider } from "../../../../lib/appContext";
import type { ComposerOptions } from "../../composerStore";
import { useComposerDefaults } from "./useComposerDefaults";

function defaults(options: ComposerOptions) {
	const queryClient = new QueryClient();
	const project = { statuses: [], ticketTemplate: "" };
	const epic = { currentWave: { ref: "TRL/plan/first" } };
	queryClient.setQueryData(["project"], project);
	queryClient.setQueryData(["epic"], epic);
	const app = {
		orpc: {
			projects: { get: { queryOptions: () => ({ queryKey: ["project"], queryFn: async () => project }) } },
			epics: { get: { queryOptions: () => ({ queryKey: ["epic"], queryFn: async () => epic }) } },
		},
	} as unknown as AppContext;
	const router = createRouter({
		routeTree: createRootRoute(),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	let result: ReturnType<typeof useComposerDefaults>;
	function Probe() {
		result = useComposerDefaults(options);
		return null;
	}
	renderToStaticMarkup(
		<RouterContextProvider router={router}>
			<QueryClientProvider client={queryClient}>
				<AppProvider value={app}>
					<Probe />
				</AppProvider>
			</QueryClientProvider>
		</RouterContextProvider>,
	);
	queryClient.clear();
	return result!;
}

test("a new project ticket has no selected wave", () => {
	expect(defaults({ project: "TRL" }).wave).toBeUndefined();
});

test("an epic current wave does not select the new ticket wave", () => {
	expect(defaults({ project: "TRL", epic: "TRL/plan" })).toMatchObject({
		epic: "TRL/plan",
		wave: undefined,
	});
});

test("an explicit wave remains selected", () => {
	expect(defaults({ project: "TRL", epic: "TRL/plan", wave: "TRL/plan/second" }).wave).toBe("TRL/plan/second");
});
